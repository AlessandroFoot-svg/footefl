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

var VER = "80";
var BOX = "footefl-" + VER;
var SHELL = ["./", "./index.html", "./manifest.webmanifest",
             "./icon-192.png", "./icon-512.png"];
/* le voci dei dettati: stanno fuori dalla pagina perche' pesano, ma
   devono essere sul telefono prima della partita — in palestra o in
   corriera la rete non c'e'. Si scaricano dopo l'app, senza tenerla
   ferma: se qualcosa non arriva, si prende al primo ascolto. */
var VOICES = ["./au/morning.mp3", "./au/market.mp3", "./au/green.mp3",
              "./au/park.mp3", "./au/ferry.mp3", "./au/lighthouse.mp3"];

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
      /* e adesso le voci, una dopo l'altra */
      return caches.open(BOX).then(function (c) {
        return VOICES.reduce(function (p, u) {
          return p.then(function () { return c.add(u)["catch"](function () {}); });
        }, Promise.resolve());
      });
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
