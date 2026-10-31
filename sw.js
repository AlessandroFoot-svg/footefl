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

var VER = "138";
var BOX = "footefl-" + VER;
var SHELL = ["./", "./index.html", "./manifest.webmanifest",
             "./icon-192.png", "./icon-512.png"];

/* ───────── due case per la stessa roba ─────────
   Le voci e le figure stanno fuori dalla pagina perche' pesano: l'app
   e' tornata sotto il mega e si apre in un attimo. Il loro posto e'
   im/ e au/ accanto all'app.
   Ma chi carica i file sul sito puo' averli lasciati sciolti nella
   radice, tutti insieme: GitHub, quando gli si trascina una cartella,
   a volte il nome della cartella se lo dimentica. Allora il guardiano
   guarda in due posti: prima dove c'e' scritto (im/crest-RAV.webp),
   poi col solo nome accanto all'app (crest-RAV.webp). Trovata una
   volta, se la tiene in dispensa e non ci pensa piu'. Cosi' il sito
   funziona com'e' adesso e continuera' a funzionare quando le
   cartelle saranno a posto. */
function bare(path) { return "./" + String(path).split("/").pop(); }
function keep(key, res) {
  caches.open(BOX).then(function (c) { c.put(key, res); });
}
/* la stessa cosa in dispensa, sotto l'uno o l'altro nome */
function shelfHit(req, url) {
  return caches.match(req).then(function (h) {
    return h || caches.match(bare(url.pathname));
  });
}
/* e se in dispensa non c'e': si chiede alla rete, prima l'uno poi l'altro */
function grab(req, url) {
  var b = bare(url.pathname);
  function plan() {
    return fetch(b).then(function (r) {
      if (r && r.ok) keep(b, r.clone());
      return r;
    });
  }
  return fetch(req).then(function (r) {
    if (r && r.ok) { keep(req, r.clone()); return r; }
    return plan();
  })["catch"](plan);
}
/* il file intero, da dove si trova: serve per tagliarne una fetta */
function whole(url) {
  var b = bare(url.pathname);
  return fetch(url.pathname).then(function (r) {
    if (r && r.ok) { keep(url.pathname, r.clone()); return r; }
    return fetch(b).then(function (r2) {
      if (r2 && r2.ok) { keep(b, r2.clone()); return r2; }
      return null;
    });
  })["catch"](function () { return null; });
}

/* L'elenco di tutto quello che sta fuori lo scrive la costruzione
   dell'app, qui dentro: cosi' non dipende da un list.json che potrebbe
   essere finito chissa' dove. Appena installata l'app il guardiano se
   le porta giu' una alla volta, senza tenere ferma la pagina — in
   palestra o in corriera la rete non c'e'. Se qualcosa non arriva, si
   prende al primo uso. */
var SHELF = [/*SHELF*/];
function haulIn(c) {
  return SHELF.reduce(function (p, n) {
    return p.then(function () {
      return c.add("./" + n)["catch"](function () {
        return c.add(bare(n))["catch"](function () {});
      });
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

  /* ───────── chi chiede « che versione sei? » ─────────
     L'app, all'avvio, viene a leggere qui dentro per sapere se la copia
     che ha in tasca e' ancora quella del sito. A una domanda del genere
     si risponde solo con la rete: servire la copia in dispensa vorrebbe
     dire rispondere « sono aggiornato » guardandosi allo specchio.
     E non si tiene da parte niente, se no la dispensa si riempie di una
     briciola per ogni avvio. */
  if (url.pathname.indexOf("sw.js") > -1) {
    e.respondWith(fetch(req, { cache:"no-store" }));
    return;
  }

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
      shelfHit(req, url).then(function (hit) {
        return hit || grab(req, url);
      })
    );
    return;
  }

  /* le voci dei dettati: dalla dispensa, anche a pezzi */
  if (url.pathname.indexOf("/au/") >= 0) {
    var range = req.headers.get("range");
    e.respondWith(
      shelfHit(req, url).then(function (hit) {
        if (hit) return range ? rangeFrom(hit, range) : hit.clone();
        /* una risposta parziale non si mette in dispensa: si chiede il
           file intero, si salva quello, e si serve la fetta */
        if (range) {
          return whole(url).then(function (full) {
            return full ? rangeFrom(full, range) : fetch(req);
          });
        }
        return grab(req, url);
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
