/* ═══════════════════════════════════════════════════════════════════
   IL GUARDIANO
   Tiene l'app sul telefono: scaricata una volta, si apre anche in
   corriera, in palestra, dove la rete non c'e'. Due regole sole.

   L'app (la pagina, l'icona, il manifesto) si prende dalla dispensa e
   basta: e' sempre la stessa, non ha senso richiederla ogni volta.
   I dati che pubblica il professore (la cartella d/) si chiedono invece
   sempre alla rete, perche' quelli cambiano a ogni giornata; se la rete
   non risponde, si tira fuori l'ultima copia.

   Quando esce una versione nuova dell'app cambia VER: la dispensa
   vecchia viene buttata e il telefono riparte pulito.
   ═══════════════════════════════════════════════════════════════════ */

var VER = "81";
var BOX = "footefl-" + VER;
var SHELL = ["./", "./index.html", "./manifest.webmanifest",
             "./icon-192.png", "./icon-512.png"];
/* Le voci e le figure stanno fuori dalla pagina perche' pesano: l'app
   e' tornata sotto il mega e si apre in un attimo. Ma devono essere sul
   telefono prima della partita — in palestra o in corriera la rete non
   c'e'. Allora, appena installata l'app, il guardiano si legge i due
   elenchi (au/list.json e im/list.json) e se le porta giu' una alla
   volta, senza tenere ferma la pagina. Se qualcosa non arriva, si
   prende al primo uso. */
var LISTS = [["./au/list.json", "./au/"], ["./im/list.json", "./im/"]];
function haulIn(c) {
  return LISTS.reduce(function (p, L) {
    return p.then(function () {
      return fetch(L[0], { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (names) {
          return names.reduce(function (q, n) {
            return q.then(function () { return c.add(L[1] + n)["catch"](function () {}); });
          }, Promise.resolve());
        })["catch"](function () {});
    });
  }, Promise.resolve());
}

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(BOX).then(function (c) {
    /* se un pezzo manca non deve saltare tutta l'installazione */
    return Promise.all(SHELL.map(function (u) {
      return c.add(u)["catch"](function () {});
    }));
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) {
      return k === BOX ? null : caches["delete"](k);
    }));
  }).then(function () { return self.clients.claim(); })
    .then(function () {
      return caches.open(BOX).then(haulIn);
    }));
});

/* ───────── un pezzo di audio alla volta ─────────
   Certi telefoni (iPhone in testa) non chiedono il file intero: chiedono
   i byte da qui a li'. Se gli si risponde con tutto il file, il lettore
   non parte. Allora dalla dispensa si taglia il pezzo chiesto e gli si
   risponde 206, come farebbe la rete. */
function rangeFrom(hit, range) {
  return hit.arrayBuffer().then(function (buf) {
    var m = /bytes=(\d+)-(\d*)/.exec(range || "");
    var tot = buf.byteLength;
    var a = m ? parseInt(m[1], 10) : 0;
    var b = m && m[2] ? parseInt(m[2], 10) : tot - 1;
    if (isNaN(a) || a >= tot) a = 0;
    if (isNaN(b) || b >= tot) b = tot - 1;
    return new Response(buf.slice(a, b + 1), {
      status: 206, statusText: "Partial Content",
      headers: {
        "Content-Type": hit.headers.get("Content-Type") || "audio/mpeg",
        "Content-Range": "bytes " + a + "-" + b + "/" + tot,
        "Content-Length": String(b - a + 1)
      }
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* i dati del professore: prima la rete, poi quello che c'e' */
  if (url.pathname.indexOf("/d/") >= 0) {
    e.respondWith(
      fetch(req, { cache: "no-store" }).then(function (r) {
        var copy = r.clone();
        caches.open(BOX).then(function (c) { c.put(req, copy); });
        return r;
      })["catch"](function () {
        return caches.match(req);
      })
    );
    return;
  }

  /* un indirizzo con la coda — .../?c=ALE-QM34, la tesserina di un alunno —
     non combacia con niente in dispensa. Senza rete deve aprirsi lo stesso:
     si serve la pagina di partenza, che e' la stessa app. */
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)["catch"](function () {
        return caches.match("./index.html").then(function (h) {
          return h || caches.match("./");
        });
      })
    );
    return;
  }

  /* le figure: dalla dispensa, e basta — non cambiano mai */
  if (url.pathname.indexOf("/im/") >= 0) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (r) {
          if (r && r.ok) {
            var copy = r.clone();
            caches.open(BOX).then(function (c) { c.put(req, copy); });
          }
          return r;
        });
      })
    );
    return;
  }

  /* le voci dei dettati: dalla dispensa, anche a pezzi */
  if (url.pathname.indexOf("/au/") >= 0) {
    var range = req.headers.get("range");
    e.respondWith(
      caches.match(new Request(req.url)).then(function (hit) {
        if (hit) return range ? rangeFrom(hit, range) : hit.clone();
        return fetch(req).then(function (r) {
          /* una risposta parziale non si mette in dispensa: si rifa' la
             richiesta intera, si salva quella, e si serve il pezzo */
          if (range) {
            fetch(url.pathname).then(function (full) {
              if (full && full.ok) {
                caches.open(BOX).then(function (c) { c.put(url.pathname, full); });
              }
            })["catch"](function () {});
          } else if (r && r.ok) {
            var copy = r.clone();
            caches.open(BOX).then(function (c) { c.put(req, copy); });
          }
          return r;
        });
      })
    );
    return;
  }

  /* l'app: prima la dispensa, e intanto si controlla se e' cambiata */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var live = fetch(req).then(function (r) {
        if (r && r.ok) {
          var copy = r.clone();
          caches.open(BOX).then(function (c) { c.put(req, copy); });
        }
        return r;
      })["catch"](function () { return hit; });
      return hit || live;
    })
  );
});
