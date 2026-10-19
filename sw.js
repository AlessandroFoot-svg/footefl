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

var VER = "34";
var BOX = "footefl-" + VER;
var SHELL = ["./", "./index.html", "./manifest.webmanifest",
             "./icon-192.png", "./icon-512.png"];

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
  }).then(function () { return self.clients.claim(); }));
});

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
