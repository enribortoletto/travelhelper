// Service worker: gestisce le notifiche Web Push (03-integrations.md,
// 05-notification-rules.md). Il resto della logica PWA (cache offline,
// installabilità) arriva nella rifinitura finale.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Scozia 2026", body: event.data.text() };
  }

  const { title, body, url, tag } = payload;

  event.waitUntil(
    self.registration.showNotification(title || "Scozia 2026", {
      body,
      tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
