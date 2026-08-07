// Supabase Edge Function: send-push
// নতুন মেসেজ/কল হলে Postgres ট্রিগার এই ফাংশনকে HTTP POST করে (দেখুন schema.sql-এর
// notify_new_message / notify_new_call ফাংশন)। এই ফাংশন সংশ্লিষ্ট প্রাপকদের
// push_subscriptions থেকে বের করে Web Push নোটিফিকেশন পাঠায়।
//
// ডিপ্লয়: supabase functions deploy send-push
// এনভায়রনমেন্ট ভ্যারিয়েবল (supabase secrets set দিয়ে বসান):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Supabase নিজে থেকেই ইনজেক্ট করে)
//   WEBHOOK_SECRET (schema.sql-এর app.settings.edge_function_secret এর সাথে মিলতে হবে)

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    if (WEBHOOK_SECRET) {
      const incomingSecret = req.headers.get('x-webhook-secret');
      if (incomingSecret !== WEBHOOK_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.warn('VAPID keys not configured — skipping push');
      return new Response(JSON.stringify({ skipped: true, reason: 'no-vapid-keys' }), { status: 200 });
    }

    const { type, record } = await req.json();

    let recipientIds = [];
    let payload = null;

    if (type === 'message') {
      // এই চ্যাটের সব সদস্য (নিজেকে বাদে) — সবাইকে পাঠাও
      const { data: members } = await supabaseAdmin
        .from('chat_members')
        .select('user_id')
        .eq('chat_id', record.chat_id)
        .neq('user_id', record.sender_id);
      recipientIds = (members || []).map((m) => m.user_id);

      const { data: sender } = await supabaseAdmin
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', record.sender_id)
        .maybeSingle();

      const bodyPreview =
        record.kind === 'voice' ? '🎤 ভয়েস মেসেজ' : record.kind === 'image' ? '📷 ছবি পাঠিয়েছেন' : record.kind === 'file' ? '📎 ফাইল পাঠিয়েছেন' : record.body;

      payload = {
        kind: 'message',
        title: sender?.display_name || 'নতুন মেসেজ',
        body: bodyPreview?.slice(0, 120) || 'নতুন মেসেজ এসেছে',
        icon: sender?.avatar_url || '/icons/icon-192.png',
        chatId: record.chat_id,
        tag: `chat-${record.chat_id}`
      };
    } else if (type === 'call') {
      // এই কলের অংশগ্রহণকারীরা (caller বাদে) — রিং নোটিফিকেশন
      const { data: participants } = await supabaseAdmin
        .from('call_participants')
        .select('user_id')
        .eq('call_id', record.id)
        .neq('user_id', record.caller_id);
      recipientIds = (participants || []).map((p) => p.user_id);

      const { data: caller } = await supabaseAdmin
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', record.caller_id)
        .maybeSingle();

      payload = {
        kind: 'call',
        title: `${caller?.display_name || 'কেউ একজন'} কল করছেন`,
        body: record.is_video ? '🎥 ভিডিও কল আসছে' : '📞 ভয়েস কল আসছে',
        icon: caller?.avatar_url || '/icons/icon-192.png',
        chatId: record.chat_id,
        callLogId: record.id,
        isVideo: record.is_video,
        tag: `call-${record.id}`,
        requireInteraction: true
      };
    } else {
      return new Response(JSON.stringify({ skipped: true, reason: 'unknown-type' }), { status: 200 });
    }

    if (!recipientIds.length) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .in('user_id', recipientIds);

    if (!subs || !subs.length) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no-subscriptions' }), { status: 200 });
    }

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          JSON.stringify(payload)
        )
      )
    );

    // যেসব সাবস্ক্রিপশন আর বৈধ না (410/404), সেগুলো ডাটাবেস থেকে মুছে ফেলুন
    const toDelete = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const statusCode = r.reason?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          toDelete.push(subs[i].endpoint);
        }
      }
    });
    if (toDelete.length) {
      await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', toDelete);
    }

    const sentCount = results.filter((r) => r.status === 'fulfilled').length;
    return new Response(JSON.stringify({ sent: sentCount, total: subs.length }), { status: 200 });
  } catch (err) {
    console.error('send-push error', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
