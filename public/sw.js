const CACHE_NAME = 'waves-cache-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for navigation & API, cache-first for static assets.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSupabase = url.hostname.includes('supabase.co');
  if (isSupabase) return; // never intercept realtime/auth/API calls

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Web Push নোটিফিকেশন — অ্যাপ ব্যাকগ্রাউন্ডে বা সম্পূর্ণ বন্ধ থাকলেও কল/মেসেজ পপ-আপ দেখায়।
// send-push Edge Function (supabase/functions/send-push) এখান থেকে payload পাঠায়:
// { kind: 'message'|'call', title, body, icon, chatId, callLogId?, isVideo?, tag, requireInteraction? }
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Waves', body: event.data.text() };
  }

  const isCall = data.kind === 'call';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    requireInteraction: !!data.requireInteraction,
    // কল এলে ফোনে সাধারণ মেসেজের চেয়ে বেশি লক্ষণীয় ভাইব্রেশন প্যাটার্ন (রিং-এর মতো পুনরাবৃত্তি)
    vibrate: isCall ? [400, 200, 400, 200, 400] : [150, 80, 150],
    data: {
      url: '/',
      chatId: data.chatId || null,
      callLogId: data.callLogId || null,
      isVideo: !!data.isVideo,
      kind: data.kind || 'message'
    },
    actions: isCall
      ? [
          { action: 'accept', title: '✓ গ্রহণ করুন' },
          { action: 'decline', title: '✕ প্রত্যাখ্যান' }
        ]
      : undefined
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Waves', options));
});

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  if (event.action === 'decline') {
    // ডিক্লাইন করলে অ্যাপ না খুলেই নোটিফিকেশন বন্ধ করে দিলেই যথেষ্ট;
    // মূল CallManager সিগন্যালিং চ্যানেলে declineCall পাঠানোর জন্য অ্যাপ খোলা থাকা লাগবে,
    // তাই এখানে শুধু নোটিফিকেশন সরিয়ে দেওয়া হলো।
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'notification-click', ...data, action: event.action });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
