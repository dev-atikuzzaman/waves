import { supabase } from './supabase.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/**
 * ব্রাউজার নোটিফিকেশন পারমিশন চান এবং Web Push-এ সাবস্ক্রাইব করুন।
 * সফল হলে সাবস্ক্রিপশন Supabase-এ সেভ হয়, যাতে Edge Function পরে সেটাতে পুশ পাঠাতে পারে।
 * অ্যাপ ব্যাকগ্রাউন্ডে/বন্ধ থাকলেও কল ও মেসেজের নোটিফিকেশন পপ-আপ দেখানোর জন্য এটা দরকার।
 */
export async function enablePushNotifications(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { supported: false, reason: 'browser-unsupported' };
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.warn('[Waves] VITE_VAPID_PUBLIC_KEY সেট করা নেই — পুশ নোটিফিকেশন চালু করা যাবে না।');
    return { supported: false, reason: 'no-vapid-key' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { supported: true, granted: false };
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });
  }

  const json = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth
    },
    { onConflict: 'endpoint' }
  );
  if (error) {
    console.warn('push subscription সেভ করা যায়নি', error);
    return { supported: true, granted: true, saved: false, error };
  }

  return { supported: true, granted: true, saved: true };
}

/** এই ডিভাইসের পুশ সাবস্ক্রিপশন বাতিল করুন (যেমন লগ-আউটের সময়) */
export async function disablePushNotifications() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  }
}

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'granted' | 'denied' | 'default'
}
