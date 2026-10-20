/* MEET · meet-bty.com – Service Worker nur für Push-Benachrichtigungen
   (keine Offline-Kopie der Seite, damit nie ein alter Stand hängen bleibt).
   Eine Push kommt, wenn eine Frage zum Text beantwortet wurde; Tippen öffnet die Startseite mit „Deine Frage“. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data ? e.data.text() : "" }; }
  var title = data.title || "MEET";
  var opts = {
    body: data.body || "Deine Frage wurde beantwortet.",
    icon: "/assets/icon-192.png",
    badge: "/assets/icon-192.png",
    tag: data.tag || "meet-antwort",
    renotify: true,
    data: { url: data.url || "/" }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(self.location.origin) === 0 && "focus" in list[i]) { list[i].navigate(url); return list[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
