self.addEventListener('push', (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  event.waitUntil(self.registration.showNotification(payload.title || 'ERP notification', {
    body: payload.body || '',
    icon: '/favicon.ico',
    data: { url: payload.url || '/notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/notifications', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url === target);
    return existing ? existing.focus() : self.clients.openWindow(target);
  }));
});