# Waves — WhatsApp-স্টাইল প্রিমিয়াম চ্যাট PWA

Vite + Vanilla JavaScript + Supabase (Realtime, Auth, Postgres) দিয়ে বানানো একটা প্রিমিয়াম-ডিজাইনের রিয়েলটাইম চ্যাট PWA। ইমেইল OTP লগইন, লাইভ মেসেজিং, অনলাইন/অফলাইন প্রেজেন্স, এবং WebRTC-ভিত্তিক ভয়েস/ভিডিও কলিং আছে (Supabase Realtime Broadcast দিয়ে সিগন্যালিং)।

## ফিচার
- 📱 ইনস্টলযোগ্য PWA (manifest + service worker, অফলাইন অ্যাপ-শেল ক্যাশিং)
- 🔐 ইমেইল OTP লগইন (পাসওয়ার্ডবিহীন, Supabase Auth)
- 💬 রিয়েলটাইম ১:১ চ্যাট (Supabase Realtime + Postgres, RLS দিয়ে সুরক্ষিত)
- 🟢 লাইভ অনলাইন/অফলাইন প্রেজেন্স + "সর্বশেষ দেখা"
- 📞🎥 WebRTC ভয়েস ও ভিডিও কলিং (Supabase চ্যানেল দিয়ে signaling — কোনো আলাদা সার্ভার লাগে না)
- 🎨 প্রিমিয়াম কাস্টম ডিজাইন সিস্টেম (Sora + Inter টাইপোগ্রাফি, ইমারেল্ড/গোল্ড ইঙ্ক প্যালেট)
- 📱ফুল রেসপন্সিভ — মোবাইলে সিঙ্গেল-পেন WhatsApp-স্টাইল নেভিগেশন

## ১) প্রজেক্ট চালু করা (লোকাল)

```bash
npm install
cp .env.example .env
# .env ফাইলে Supabase URL ও anon key বসান (নিচে দেখুন)
npm run dev
```

## ২) Supabase প্রজেক্ট সেটআপ

1. [supabase.com](https://supabase.com) এ একটা নতুন প্রজেক্ট বানান।
2. **SQL Editor** এ গিয়ে `supabase/schema.sql` ফাইলের পুরো কনটেন্ট রান করুন — এটা এই টেবিলগুলো বানাবে:
   - `profiles` — ইউজার প্রোফাইল, অনলাইন স্ট্যাটাস
   - `chats`, `chat_members` — কথোপকথনের সদস্যপদ
   - `messages` — মেসেজ, সব Row Level Security দিয়ে সুরক্ষিত
3. **Authentication → Providers → Email** এ গিয়ে:
   - "Confirm email" অন থাকলে OTP ফ্লো ঠিকভাবে কাজ করবে
   - Email OTP এমনিতেই এনাবল থাকে; আলাদা কিছু করার দরকার নেই
4. **Authentication → URL Configuration** এ আপনার Vercel ডোমেইন (যেমন `https://your-app.vercel.app`) `Site URL` ও `Redirect URLs`-এ যোগ করুন।
5. **Project Settings → API** থেকে কপি করুন:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`
6. **Database → Replication** এ গিয়ে নিশ্চিত করুন `messages` ও `profiles` টেবিল Realtime publication-এ আছে (স্কিমা স্ক্রিপ্টেই এটা করা হয়, তবু চেক করে নিন)।

## ৩) Vercel-এ ডিপ্লয়

1. এই প্রজেক্ট একটা GitHub রিপোতে পুশ করুন।
2. Vercel-এ **New Project** → রিপো ইমপোর্ট করুন। Framework preset: **Vite**।
3. **Project Settings → Environment Variables** এ এই দুটো (Production + Preview + Development সব এনভায়রনমেন্টে) বসান:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
   ভিডিও/ভয়েস কল আরও নির্ভরযোগ্য করতে TURN সার্ভার ক্রেডেনশিয়ালও (ঐচ্ছিক, নিচে দেখুন) যোগ করতে পারেন:
   ```
   VITE_TURN_URL=turn:your-turn-host:3478
   VITE_TURN_USERNAME=xxxx
   VITE_TURN_CREDENTIAL=xxxx
   ```
4. Deploy চাপুন। বিল্ড কমান্ড: `npm run build`, আউটপুট ডিরেক্টরি: `dist` (Vite প্রিসেট নিলে অটো-ডিটেক্ট হবে)।

> **গুরুত্বপূর্ণ:** `VITE_` প্রিফিক্স ছাড়া কোনো এনভায়রনমেন্ট ভ্যারিয়েবল ব্রাউজারে (Vite বিল্ডে) পাবেন না — নাম ঠিক এভাবেই রাখুন।

## ৪) TURN সার্ভার কেন দরকার হতে পারে

শুধু STUN (ডিফল্টে যোগ করা আছে) দিয়ে বেশিরভাগ নেটওয়ার্কে কল কানেক্ট হবে, কিন্তু কড়া NAT/ফায়ারওয়ালের পেছনে থাকা ইউজারদের জন্য TURN সার্ভার লাগবে। ফ্রি/প্রোডাকশন অপশন:
- [metered.ca/stun-turn](https://www.metered.ca/tools/openrelay/) — ফ্রি টিয়ার আছে
- Twilio Network Traversal Service
- নিজের [coturn](https://github.com/coturn/coturn) সার্ভার হোস্ট করা

`.env`-এ `VITE_TURN_URL` ইত্যাদি বসালেই `src/lib/calls.js` অটো সেটা ব্যবহার করবে।

## ৫) প্রজেক্ট স্ট্রাকচার

```
whatschat/
├── index.html              # অ্যাপ শেল (auth, চ্যাট UI, কল ওভারলে)
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js                # PWA সার্ভিস ওয়ার্কার
│   └── icons/
├── src/
│   ├── style.css            # প্রিমিয়াম ডিজাইন সিস্টেম (টোকেন-বেসড)
│   ├── main.js               # UI অর্কেস্ট্রেশন
│   └── lib/
│       ├── supabase.js       # Supabase ক্লায়েন্ট (env var থেকে)
│       ├── auth.js           # ইমেইল OTP অথ
│       ├── chat.js           # চ্যাট/মেসেজ CRUD + রিয়েলটাইম সাবস্ক্রিপশন
│       ├── calls.js          # WebRTC + Supabase broadcast signaling
│       └── pwa.js            # সার্ভিস ওয়ার্কার রেজিস্ট্রেশন
├── supabase/
│   └── schema.sql            # টেবিল, RLS পলিসি, ট্রিগার
├── vercel.json                # SPA রিরাইট + সার্ভিস ওয়ার্কার হেডার
└── .env.example
```

## ৬) কীভাবে কলিং কাজ করে

কোনো মেসেজ/কল টেবিলে সেভ হয় না — প্রতিটা ইউজারের নিজস্ব Supabase Realtime **broadcast চ্যানেল** (`signal:<user_id>`) আছে। কল করলে অফার/আনসার/ICE candidate সরাসরি পিয়ারের চ্যানেলে পাঠানো হয় (peer-to-peer WebRTC handshake)। এতে:
- কোনো আলাদা signaling সার্ভার লাগে না
- অডিও/ভিডিও স্ট্রিম সরাসরি ব্রাউজার-টু-ব্রাউজার যায় (Supabase শুধু handshake মেসেজ পাস করে)
- উভয় ইউজারকে অ্যাপ খোলা/অনলাইন থাকতে হবে (push notification যোগ করে অফলাইন কল-রিং করানো যায়, `sw.js`-এ এর জন্য push handler রেডি করা আছে)

## ৭) পরবর্তী উন্নতির আইডিয়া (ঐচ্ছিক)

- গ্রুপ চ্যাট (schema-তে `is_group` কলাম আগে থেকেই আছে, শুধু UI যোগ করতে হবে)
- মিডিয়া/ইমেজ শেয়ারিং (Supabase Storage বাকেট)
- মিসড-কল হিস্ট্রি সেভ করা (একটা `calls` টেবিল যোগ করে)
- Web Push দিয়ে অফলাইন নোটিফিকেশন (Supabase Edge Function + VAPID key)
- মেসেজ টাইপিং ইন্ডিকেটর (Supabase Presence API)
