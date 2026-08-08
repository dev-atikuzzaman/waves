# Waves — WhatsApp-স্টাইল প্রিমিয়াম চ্যাট PWA

Vite + Vanilla JavaScript + Supabase (Realtime, Auth, Postgres, Storage, Edge Functions) দিয়ে বানানো একটা প্রিমিয়াম-ডিজাইনের রিয়েলটাইম চ্যাট PWA। ইমেইল OTP লগইন, লাইভ মেসেজিং, অনলাইন/অফলাইন প্রেজেন্স, WebRTC-ভিত্তিক ভয়েস/ভিডিও/গ্রুপ কলিং এবং Web Push নোটিফিকেশন আছে।

## ফিচার
- 📱 ইনস্টলযোগ্য PWA (manifest + service worker, অফলাইন অ্যাপ-শেল ক্যাশিং)
- 🔐 ইমেইল OTP লগইন (পাসওয়ার্ডবিহীন, Supabase Auth)
- 💬 রিয়েলটাইম ১:১ ও গ্রুপ চ্যাট (Supabase Realtime + Postgres, RLS দিয়ে সুরক্ষিত)
- 😊 ইমোজি পিকার — ৮টা ক্যাটেগরি, সার্চ, "সাম্প্রতিক ব্যবহৃত" (ডিভাইসে সেভ থাকে), এবং শুধু-ইমোজি মেসেজ বড় ("jumbomoji") আকারে দেখায়
- ▾ WhatsApp-স্টাইল মেসেজ ড্রপডাউন মেনু (রিয়েকশন, উত্তর, ফরওয়ার্ড, কপি, এডিট, ডিলিট)
- ✋ মেসেজ চেপে ধরলে (long-press) কুইক-রিঅ্যাকশন পিকার খোলে
- ➦ ছবি/ফাইল/ভয়েস মেসেজে সরাসরি ফরওয়ার্ড বাটন + এক/একাধিক চ্যাটে ফরওয়ার্ড করার প্যানেল
- ✏️ মেসেজ এডিট, 🗑️ ডিলিট (সফট-ডিলিট), ↩️ রিপ্লাই কোট, ❤️ রিয়েকশন
- ✓✓ ডেলিভারড/সিন টিক, "লিখছে..." টাইপিং ইন্ডিকেটর
- 🎤 ভয়েস মেসেজ রেকর্ডিং, 📎 ফাইল/📷 ছবি শেয়ার (Supabase Storage)
- 🟢 লাইভ অনলাইন/অফলাইন প্রেজেন্স + "সর্বশেষ দেখা"
- 📞🎥 WebRTC ভয়েস, ভিডিও ও গ্রুপ কলিং (mesh টপোলজি, Supabase চ্যানেল দিয়ে signaling — কোনো আলাদা সার্ভার লাগে না)
- 🔊 স্পিকার/ইয়ারপিস টগল, 🔄 সামনে/পেছনের ক্যামেরা সুইচ (কল চলাকালীন)
- 🕑 কল হিস্ট্রি (মিসড/উত্তর দেওয়া/প্রত্যাখ্যাত, সময়কালসহ) + এক ট্যাপে আবার কল
- 🔔 **Web Push নোটিফিকেশন** — অ্যাপ ব্যাকগ্রাউন্ডে বা সম্পূর্ণ বন্ধ থাকলেও কল ও মেসেজের নেটিভ পপ-আপ (Supabase Edge Function + VAPID)
- 🔊 ইন-অ্যাপ রিংটোন ও মেসেজ পিং সাউন্ড (Web Audio API দিয়ে সিন্থেসাইজড, কোনো external mp3 লাগে না)
- 🎨 প্রিমিয়াম কাস্টম ডিজাইন সিস্টেম (Sora + Inter টাইপোগ্রাফি, ইমারেল্ড/গোল্ড ইঙ্ক প্যালেট)
- 📱ফুল রেসপন্সিভ — মোবাইলে সিঙ্গেল-পেন WhatsApp-স্টাইল নেভিগেশন

### বাগ ফিক্স হিস্ট্রি (সর্বশেষ রাউন্ড)
- **নতুন**: WhatsApp-স্টাইল মেসেজ ▾ ড্রপডাউন মেনু, long-press কুইক-রিঅ্যাকশন, এবং মেসেজ ফরওয়ার্ড ফিচার যোগ করা হয়েছে (`messages.forwarded` কলাম, `supabase/migration_6_forward_feature.sql` দেখুন যদি আগে থেকে DB চালু থাকে)।
- **মোবাইল আবিষ্কারযোগ্যতা ফিক্স**: ▾ চেভরন বাটন আগে শুধু hover-এ (ডেস্কটপ) দেখা যেত, ফলে টাচ ডিভাইসে এটা খুঁজেই পাওয়া যেত না। এখন ডিফল্টে হালকাভাবে দৃশ্যমান থাকে।

### বাগ ফিক্স হিস্ট্রি (আগের রাউন্ড)
- **🔴 টেক্সট মেসেজে পুশ নোটিফিকেশন একদমই যাচ্ছিল না**: `schema.sql`-এর `notify_new_message()` ফাংশনে URL-এ `https:` এর পরে `//` মিসিং ছিল (`https:xxxx.supabase.co/...`) — এটা একটা অবৈধ URL হওয়ায় `pg_net`-এর প্রতিটা কল নীরবে ব্যর্থ হচ্ছিল, কোনো এরর ছাড়াই। ঠিক করা হয়েছে।
- **🔴 সিকিউরিটি**: আগের `schema.sql`-এ আসল Supabase প্রজেক্ট রেফ ও আসল `WEBHOOK_SECRET` হার্ডকোড অবস্থায় ছিল এবং তা রিপোতে কমিট হয়ে গিয়েছিল। ফাইলে আবার প্লেসহোল্ডার বসানো হয়েছে — **আপনাকে অবশ্যই WEBHOOK_SECRET রোটেট করতে হবে**, নিচে "৩.৫" ধাপে বিস্তারিত দেখুন।
- **`.env.example` ও `.gitignore` মিসিং ছিল** — যোগ করা হয়েছে (VAPID key-সহ)।

### বাগ ফিক্স হিস্ট্রি
- **অডিও ড্রপআউট**: ICE ক্যান্ডিডেট এখন remote description সেট হওয়ার আগে এলে সাময়িকভাবে জমা রাখা হয় (queue) এবং পরে flush করা হয়; আগে race condition-এর কারণে মাঝে মাঝে অডিও ট্র্যাক কানেক্ট হতো না। অডিও কনস্ট্রেইন্টে echoCancellation/noiseSuppression/autoGainControl স্পষ্টভাবে চালু রাখা হয়েছে।
- **সরাসরি লাউডস্পিকার**: আগে স্পিকার/ইয়ারপিস কন্ট্রোলই ছিল না। এখন কল ওভারলেতে 🔊 বাটন দিয়ে `setSinkId` ব্যবহার করে আউটপুট ডিভাইস বাছাই করা যায় (সাপোর্টেড ব্রাউজারে)।
- **ব্যাক ক্যামেরায় ব্ল্যাক স্ক্রিন**: প্রথম রাউন্ডে `facingMode: 'user'` হার্ডকোড ঠিক করার পরও কিছু অ্যান্ড্রয়েড ডিভাইসে সমস্যা থেকে যায়, কারণ পুরনো ক্যামেরা ট্র্যাক বন্ধ না করেই নতুন `getUserMedia` কল করা হতো — একাধিক ক্যামেরা স্ট্রিম একসাথে চালু রাখতে গেলে হার্ডওয়্যার লক কনটেনশনে দ্বিতীয়টা কালো/ফ্রিজ হয়ে যেত। এখন প্রথমে পুরনো ট্র্যাক `stop()` করা হয়, তারপর `enumerateDevices()` দিয়ে প্রকৃত deviceId বের করে ক্যামেরা রিকোয়েস্ট করা হয় (exact facingMode-এর চেয়ে বেশি নির্ভরযোগ্য), সাথে তিন ধাপের fallback (deviceId → exact facingMode → ideal facingMode) আছে।
- **কল/মেসেজে সাউন্ড না আসা**: ইন-অ্যাপ রিংটোন (ইনকামিং কল), রিংব্যাক টোন (আউটগোয়িং কল), এবং মেসেজ পিং যোগ করা হয়েছে — ট্যাব খোলা থাকলেই বাজবে।
- **অ্যাপ ব্যাকগ্রাউন্ডে/বন্ধ থাকলে কল পপ-আপ না আসা**: সম্পূর্ণ Web Push স্ট্যাক যোগ করা হয়েছে (নিচে "Web Push সেটআপ" দেখুন) — এখন অ্যাপ সম্পূর্ণ বন্ধ থাকলেও OS-লেভেল নোটিফিকেশন আসবে।

## ১) প্রজেক্ট চালু করা (লোকাল)

```bash
npm install
cp .env.example .env
# .env ফাইলে Supabase URL, anon key, VAPID public key বসান (নিচে দেখুন)
npm run dev
```

## ২) Supabase প্রজেক্ট সেটআপ

1. [supabase.com](https://supabase.com) এ একটা নতুন প্রজেক্ট বানান।
2. **SQL Editor** এ গিয়ে `supabase/schema.sql` ফাইলের পুরো কনটেন্ট রান করুন — এটা এই টেবিলগুলো বানাবে:
   - `profiles` — ইউজার প্রোফাইল, অনলাইন স্ট্যাটাস
   - `chats`, `chat_members` — কথোপকথনের সদস্যপদ (১:১ ও গ্রুপ উভয়)
   - `messages` — মেসেজ (টেক্সট/ভয়েস/ফাইল/ছবি, রিপ্লাই, এডিট, সফট-ডিলিট), সব Row Level Security দিয়ে সুরক্ষিত
   - `message_reactions`, `message_receipts` — রিয়েকশন ও ডেলিভারড/সিন টিক
   - `call_logs`, `call_participants` — কল হিস্ট্রি
   - `push_subscriptions` — Web Push সাবস্ক্রিপশন (ডিভাইস-প্রতি একটা রো)
   - `attachments` নামে একটা পাবলিক Storage bucket (ভয়েস নোট/ফাইল/ছবির জন্য)
   - নতুন মেসেজ/কলে Edge Function ট্রিগার করার জন্য `pg_net` এক্সটেনশন + ট্রিগার ফাংশন

   **আগে থেকে চলমান প্রজেক্টে আপগ্রেড করছেন?** পুরো `schema.sql` আবার রান করলেই যথেষ্ট (idempotent), অথবা শুধু `supabase/migration_5_premium_features.sql` রান করুন।
3. **Authentication → Providers → Email** এ গিয়ে:
   - "Confirm email" অন থাকলে OTP ফ্লো ঠিকভাবে কাজ করবে
   - Email OTP এমনিতেই এনাবল থাকে; আলাদা কিছু করার দরকার নেই
4. **Authentication → Providers → Google** এনাবল করুন (Google দিয়ে পাসওয়ার্ড/OTP ছাড়া এক-ক্লিক লগইনের জন্য):
   - [Google Cloud Console](https://console.cloud.google.com/apis/credentials) এ একটা **OAuth 2.0 Client ID** বানান (Application type: **Web application**)
   - **Authorized redirect URIs**-এ Supabase-এর দেওয়া কলব্যাক URL বসান — এটা Supabase Dashboard-এর Google provider পেজেই দেখানো থাকে, সাধারণত এরকম দেখতে: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
   - Google Cloud Console থেকে পাওয়া **Client ID** ও **Client Secret** Supabase Dashboard-এর Google provider ফর্মে বসিয়ে Save করুন
   - **Authorized JavaScript origins**-এ আপনার অ্যাপের ডোমেইন (`http://localhost:5173` ডেভেলপমেন্টে, আর প্রোডাকশনে আপনার Vercel ডোমেইন) যোগ করুন
   - এটা সেটআপ না করলে "Google দিয়ে চালিয়ে যান" বাটনে ক্লিক করলে এরর আসবে, কিন্তু ইমেইল OTP লগইন ঠিকই কাজ করবে
5. **Authentication → URL Configuration** এ আপনার Vercel ডোমেইন (যেমন `https://your-app.vercel.app`) `Site URL` ও `Redirect URLs`-এ যোগ করুন। এটা OTP ও Google — দুই ধরনের লগইনের জন্যই দরকার, কারণ Google সাইন-ইনের পর Supabase এই URL-এই ফিরিয়ে আনে।
6. **Project Settings → API** থেকে কপি করুন:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`
7. **Database → Replication** এ গিয়ে নিশ্চিত করুন `messages` ও `profiles` টেবিল Realtime publication-এ আছে (স্কিমা স্ক্রিপ্টেই এটা করা হয়, তবু চেক করে নিন)।

### Google সাইন-ইন কীভাবে কাজ করে
বাটনে ক্লিক করলে `signInWithGoogle()` ব্রাউজারকে Google-এর কনসেন্ট স্ক্রিনে পাঠায়। সেখানে অনুমতি দিলে Google ব্যবহারকারীকে ফিরিয়ে আনে অ্যাপের URL-এ (৫নং ধাপে সেট করা), আর Supabase নিজে থেকেই একটা সেশন তৈরি করে ফেলে — এই সেশন `onAuthChange()`-এ ঠিক ইমেইল OTP লগইনের মতোই ধরা পড়ে, তাই বাকি অ্যাপ কোনো পার্থক্য বোঝে না। প্রথমবার Google দিয়ে সাইন-ইন করলে `ensureProfile()` Google প্রোফাইল থেকে নাম ও ছবি নিয়ে স্বয়ংক্রিয়ভাবে `profiles` টেবিলে রো বানিয়ে দেয়। কেউ যদি একই ইমেইল দিয়ে আগে OTP দিয়ে লগইন করে থাকে, Supabase একই ইউজার হিসেবে দুটো পদ্ধতিকেই এক রাখে (Supabase একাউন্ট-লিংকিং অটো হ্যান্ডেল করে)।

## ৩) Web Push সেটআপ (কল/মেসেজ নোটিফিকেশন অ্যাপ বন্ধ থাকলেও পেতে)

এই অংশ ছাড়া অ্যাপ পুরোপুরি কাজ করবে, কিন্তু ব্যবহারকারী ব্রাউজার ট্যাব/অ্যাপ বন্ধ করে দিলে বা অন্য অ্যাপে চলে গেলে কল/মেসেজের পপ-আপ পাবে না। ধাপগুলো একটু টেকনিক্যাল কিন্তু একবারই করতে হবে।

### ৩.১ VAPID key জেনারেট করুন

```bash
npx web-push generate-vapid-keys
```
এটা একটা `Public Key` ও `Private Key` দেবে। **⚠️ এই README-এর সাথে কোনো ডেমো/placeholder VAPID key শেয়ার করা হয়নি — নিজে জেনারেট করে নিন, প্রতিটা ডিপ্লয়মেন্টের জন্য আলাদা key ব্যবহার করুন।**

### ৩.২ Supabase CLI ইনস্টল ও লগইন করুন

```bash
npm install -g supabase
supabase login
supabase link --project-ref <আপনার-প্রজেক্ট-রেফ>
```

### ৩.৩ Edge Function সিক্রেট সেট করুন

```bash
supabase secrets set VAPID_PUBLIC_KEY=<৩.১ থেকে পাওয়া public key>
supabase secrets set VAPID_PRIVATE_KEY=<৩.১ থেকে পাওয়া private key>
supabase secrets set VAPID_SUBJECT=mailto:you@example.com
supabase secrets set WEBHOOK_SECRET=<একটা লম্বা র‍্যান্ডম স্ট্রিং নিজে বানান>
```
`WEBHOOK_SECRET` জেনারেট করতে: `openssl rand -hex 32`

### ৩.৪ Edge Function ডিপ্লয় করুন

```bash
supabase functions deploy send-push --no-verify-jwt
```
`--no-verify-jwt` দরকার কারণ Postgres ট্রিগার থেকে কল হবে, ইউজার সেশন থেকে না — এর বদলে `WEBHOOK_SECRET` হেডার দিয়ে যাচাই করা হয় (দেখুন `supabase/functions/send-push/index.ts`)।

### ৩.৫ Postgres ট্রিগারে Edge Function URL ও secret বসান

> **🔴 আপনার প্রজেক্টের জন্য জরুরি নোট:** আপলোড করা কোডে এই দুটো প্লেসহোল্ডারের জায়গায় আসল মান হার্ডকোড করা অবস্থায় পাওয়া গেছে এবং সেটা GitHub রিপোতে কমিট হয়ে গেছে বলে মনে হচ্ছে। তার মানে ওই `WEBHOOK_SECRET`-টা এখন লিক হয়ে গেছে ধরে নিতে হবে। রিডিপ্লয় করার আগে অবশ্যই:
> 1. `openssl rand -hex 32` দিয়ে একটা **নতুন** সিক্রেট বানান
> 2. `supabase secrets set WEBHOOK_SECRET=<নতুন-মান>` চালান এবং `supabase functions deploy send-push --no-verify-jwt` দিয়ে আবার ডিপ্লয় করুন
> 3. নিচের `<WEBHOOK_SECRET>` প্লেসহোল্ডারে ওই *নতুন* মানটা বসান (পুরনো লিক হওয়া মান না)
> 4. ভবিষ্যতে `schema.sql` রিপোতে সবসময় প্লেসহোল্ডার আকারেই রাখুন — Supabase SQL Editor-এ শুধু সাময়িকভাবে মান বসিয়ে রান করুন, তারপর ফাইলে আবার প্লেসহোল্ডার ফিরিয়ে দিয়ে কমিট করুন

`supabase/schema.sql` ফাইলের **STEP 4** অংশে (`notify_new_message` ও `notify_new_call` ফাংশনের ভেতরে) দুই জায়গায় প্লেসহোল্ডার আছে:
```sql
fn_url text := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push';
fn_secret text := '<WEBHOOK_SECRET>';
begin
  if fn_url like '%<PROJECT_REF>%' or fn_secret like '%<WEBHOOK_SECRET>%' then
    return new; -- এখনো বসানো হয়নি — স্কিপ করুন
  end if;
```
`<PROJECT_REF>` কে আপনার Supabase প্রজেক্ট রেফ দিয়ে এবং `<WEBHOOK_SECRET>` কে ৩.৩-এ সেট করা মানটা দিয়ে বদলে **দুইটা ফাংশনেই** (মেসেজ ও কল, দুই জায়গায়) রিপ্লেস করুন — `fn_url`/`fn_secret` এর ডিক্লেয়ারেশন **আর** উপরের `if` গার্ড-লাইন দুই জায়গাতেই একই মান বসবে। তারপর `supabase/migration_7_fix_push_notifications.sql` অথবা পুরো `schema.sql` SQL Editor-এ রান করুন।

> **🐛 আগে যে বাগ ছিল (এখন ফিক্সড):** এই গার্ড-লাইনটা (`if fn_url like '%...%' then return new`) আগে ভুলভাবে *আসল, ইতিমধ্যে-বসানো* প্রজেক্ট-রেফ দিয়ে লেখা ছিল, `<PROJECT_REF>` প্লেসহোল্ডার দিয়ে না। ফলে URL সঠিকভাবে পূরণ করার পরও এই চেক সবসময় true থাকত (URL-এ তো নিজের প্রজেক্ট-রেফ থাকবেই), আর ফাংশন প্রতিবার নীরবে স্কিপ হয়ে যেত — pg_net কখনো কলই হতো না। **এটাই "অ্যাপ বন্ধ থাকলে কোনো নোটিফিকেশন না আসা"-র আসল কারণ ছিল**, VAPID/সাবস্ক্রিপশন সেটআপ ঠিক থাকলেও। এখন গার্ডটা `<PROJECT_REF>`/`<WEBHOOK_SECRET>` এর আক্ষরিক `< >` সিনট্যাক্সের সাথে মেলে, যা কোনো বাস্তব মানে থাকতে পারে না।

> **⚠️ কেন হার্ডকোড করা, `alter database ... set app.settings.x` কেন নয়?** আগের ভার্সনে `current_setting('app.settings.x')` দিয়ে করা হতো, কিন্তু Supabase-এর pooled connection-এ session-level GUC অনির্ভরযোগ্যভাবে propagate হয় — ফলে ট্রিগার প্রায়ই নীরবে স্কিপ হয়ে যেত (কোনো এরর ছাড়াই, মেসেজ/কল ঠিকই কাজ করত কিন্তু পুশ কখনো পাঠানো হতো না)। ফাংশনের ভেতরে সরাসরি বসানো নির্ভরযোগ্য, এবং যেহেতু ফাংশনটা `security definer` ও শুধু ট্রিগার থেকেই কল হয় (ক্লায়েন্ট থেকে সরাসরি না), এটা নিরাপদ।

এটা সঠিকভাবে না বসালে trigger চুপচাপ push পাঠানো স্কিপ করবে (মেসেজ/কল পাঠাতে ব্যর্থ হবে না, শুধু নোটিফিকেশন যাবে না)।

### ৩.৬ Frontend-এ VAPID public key বসান

`.env`-এ:
```
VITE_VAPID_PUBLIC_KEY=<৩.১ থেকে পাওয়া public key — শুধু public, private key কখনোই ফ্রন্টএন্ডে দেবেন না>
```

### কীভাবে কাজ করে
লগইনের পর অ্যাপ ব্রাউজার নোটিফিকেশন পারমিশন চায়। অনুমতি দিলে `push.js` ব্রাউজারের PushManager-এ সাবস্ক্রাইব করে এবং সাবস্ক্রিপশন `push_subscriptions` টেবিলে সেভ করে। নতুন মেসেজ ইনসার্ট হলে `notify_new_message` ট্রিগার এবং কোনো নতুন কল-পার্টিসিপেন্ট যোগ হলে `notify_new_call` ট্রিগার `pg_net` দিয়ে Edge Function-কে কল করে, যেটা প্রাপকের সাবস্ক্রিপশন খুঁজে সরাসরি ব্রাউজার/OS-কে push পাঠায় — এটা অ্যাপ খোলা না থাকলেও কাজ করে, কারণ ব্রাউজারের নিজস্ব push service (FCM/Mozilla push/APNs ওয়েব push ইত্যাদি) এটা ডেলিভার করে, সার্ভিস ওয়ার্কার সেটা রিসিভ করে `sw.js`-এর `push` ইভেন্টে নোটিফিকেশন দেখায়।

> **নোট:** কল-নোটিফিকেশনের ট্রিগার ইচ্ছাকৃতভাবে `call_logs`-এর বদলে `call_participants`-এর insert-এ বসানো — কারণ ক্লায়েন্ট আগে `call_logs` রো বানায়, তারপর আলাদা কলে `call_participants` রো যোগ করে। `call_logs`-এ ট্রিগার রাখলে তখনো কোনো participant ডাটাবেসে না থাকায় Edge Function সবসময় শূন্য প্রাপক পেত।

> **নোট:** iOS Safari-তে Web Push কাজ করতে হলে অ্যাপটা প্রথমে হোম স্ক্রিনে "Add to Home Screen" দিয়ে ইনস্টল করা থাকতে হবে (iOS 16.4+)। সাধারণ Safari ট্যাবে Web Push সাপোর্ট নেই।

### ৩.৭ সমস্যা হলে যেভাবে ডিবাগ করবেন

1. **Supabase Dashboard → Edge Functions → send-push → Logs** দেখুন — মেসেজ পাঠানো বা কল করার পরপরই এখানে লগ আসা উচিত (`[send-push] type=... sent=...`)। কিছুই না এলে মানে ট্রিগার Edge Function পর্যন্ত পৌঁছাচ্ছে না (ধাপ ৩.৫ আবার চেক করুন — placeholder ঠিকভাবে বদলানো হয়েছে কিনা)।
2. Edge Function লগে `no recipients resolved` বা `no push_subscriptions rows found` দেখলে — প্রাপকের ব্রাউজারে নোটিফিকেশন পারমিশন `granted` কিনা এবং `push_subscriptions` টেবিলে তার রো আছে কিনা চেক করুন (SQL Editor-এ `select * from push_subscriptions;`)।
3. লগে `sent=1/1` দেখলেও ফোনে নোটিফিকেশন না এলে — এটা ডিভাইস/OS-লেভেল সমস্যা: Android-এ অ্যাপের নোটিফিকেশন পারমিশন সিস্টেম সেটিংসে অন আছে কিনা, ব্যাটারি অপ্টিমাইজেশন/Doze mode অ্যাপটাকে push wake-up করতে বাধা দিচ্ছে কিনা (Chrome/PWA-কে "Unrestricted" ব্যাটারি ব্যবহারে রাখুন) দেখুন।
4. `pg_net`-এর HTTP রেসপন্স নিজেই চেক করতে চাইলে SQL Editor-এ: `select * from net._http_response order by created desc limit 5;`

## ৪) Vercel-এ ডিপ্লয়

1. এই প্রজেক্ট একটা GitHub রিপোতে পুশ করুন।
2. Vercel-এ **New Project** → রিপো ইমপোর্ট করুন। Framework preset: **Vite**।
3. **Project Settings → Environment Variables** এ এগুলো (Production + Preview + Development সব এনভায়রনমেন্টে) বসান:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   VITE_VAPID_PUBLIC_KEY=BPeYk9...   (Web Push সেটআপ করলে; ৩নং ধাপ দেখুন)
   ```
   ভিডিও/ভয়েস কল আরও নির্ভরযোগ্য করতে TURN সার্ভার ক্রেডেনশিয়ালও (ঐচ্ছিক, নিচে দেখুন) যোগ করতে পারেন:
   ```
   VITE_TURN_URL=turn:your-turn-host:3478
   VITE_TURN_USERNAME=xxxx
   VITE_TURN_CREDENTIAL=xxxx
   ```
4. Deploy চাপুন। বিল্ড কমান্ড: `npm run build`, আউটপুট ডিরেক্টরি: `dist` (Vite প্রিসেট নিলে অটো-ডিটেক্ট হবে)।

> **গুরুত্বপূর্ণ:** `VITE_` প্রিফিক্স ছাড়া কোনো এনভায়রনমেন্ট ভ্যারিয়েবল ব্রাউজারে (Vite বিল্ডে) পাবেন না — নাম ঠিক এভাবেই রাখুন।

## ৫) TURN সার্ভার কেন দরকার হতে পারে

শুধু STUN (ডিফল্টে যোগ করা আছে) দিয়ে বেশিরভাগ নেটওয়ার্কে কল কানেক্ট হবে, কিন্তু কড়া NAT/ফায়ারওয়ালের পেছনে থাকা ইউজারদের জন্য TURN সার্ভার লাগবে। ফ্রি/প্রোডাকশন অপশন:
- [metered.ca/stun-turn](https://www.metered.ca/tools/openrelay/) — ফ্রি টিয়ার আছে
- Twilio Network Traversal Service
- নিজের [coturn](https://github.com/coturn/coturn) সার্ভার হোস্ট করা

`.env`-এ `VITE_TURN_URL` ইত্যাদি বসালেই `src/lib/calls.js` অটো সেটা ব্যবহার করবে।

## ৬) প্রজেক্ট স্ট্রাকচার

```
whatschat/
├── index.html              # অ্যাপ শেল (auth, চ্যাট UI, কল ওভারলে, কল হিস্ট্রি প্যানেল)
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js                # PWA সার্ভিস ওয়ার্কার + push/notificationclick হ্যান্ডলার
│   └── icons/
├── src/
│   ├── style.css            # প্রিমিয়াম ডিজাইন সিস্টেম (টোকেন-বেসড)
│   ├── main.js               # UI অর্কেস্ট্রেশন
│   └── lib/
│       ├── supabase.js       # Supabase ক্লায়েন্ট (env var থেকে)
│       ├── auth.js           # ইমেইল OTP অথ
│       ├── chat.js           # চ্যাট/মেসেজ CRUD + রিয়েলটাইম সাবস্ক্রিপশন (রিয়েকশন, রিসিপ্ট, টাইপিং)
│       ├── calls.js          # WebRTC (mesh গ্রুপ কল সহ) + Supabase broadcast signaling
│       ├── callLogs.js       # কল হিস্ট্রি CRUD
│       ├── voiceRecorder.js  # MediaRecorder wrapper (ভয়েস নোট)
│       ├── push.js           # Web Push সাবস্ক্রিপশন ম্যানেজমেন্ট
│       ├── sounds.js         # ইন-অ্যাপ রিংটোন/পিং (Web Audio API)
│       └── pwa.js            # সার্ভিস ওয়ার্কার রেজিস্ট্রেশন
├── supabase/
│   ├── schema.sql            # টেবিল, RLS পলিসি, ট্রিগার, pg_net push ট্রিগার
│   ├── migration_5_premium_features.sql
│   └── functions/
│       └── send-push/
│           └── index.ts      # Web Push পাঠানোর Edge Function (Deno)
├── vercel.json                # SPA রিরাইট + সার্ভিস ওয়ার্কার হেডার
└── .env.example
```

## ৭) কীভাবে কলিং কাজ করে

কোনো WebRTC handshake ডেটা টেবিলে সেভ হয় না — প্রতিটা ইউজারের নিজস্ব Supabase Realtime **broadcast চ্যানেল** (`signal:<user_id>`) আছে। কল করলে অফার/আনসার/ICE candidate সরাসরি পিয়ারের চ্যানেলে পাঠানো হয় (peer-to-peer WebRTC handshake)। গ্রুপ কলে প্রতিটা অংশগ্রহণকারী একে অপরের সাথে আলাদা peer connection বানায় (mesh টপোলজি)। এতে:
- কোনো আলাদা signaling সার্ভার লাগে না
- অডিও/ভিডিও স্ট্রিম সরাসরি ব্রাউজার-টু-ব্রাউজার যায় (Supabase শুধু handshake মেসেজ পাস করে)
- দুই পক্ষকেই realtime সাবস্ক্রিপশন সচল থাকতে হয় (অ্যাপ ফোরগ্রাউন্ড বা ব্যাকগ্রাউন্ড ট্যাবে খোলা) — সম্পূর্ণ বন্ধ থাকলে handshake সম্ভব না, তবে Web Push দিয়ে ব্যবহারকারীকে জানানো হবে যে কেউ কল করেছে যাতে সে অ্যাপ খুলে কলব্যাক করতে পারে
- কল হিস্ট্রি (`call_logs`/`call_participants`) আলাদাভাবে DB-তে সেভ হয়, WebRTC handshake থেকে স্বতন্ত্র

## ৮) পরবর্তী উন্নতির আইডিয়া (ঐচ্ছিক)

- মেসেজে একাধিক ফাইল/মাল্টি-ইমেজ অ্যাটাচমেন্ট
- গ্রুপ চ্যাট তৈরির UI (schema ও `createGroupChat()` হেল্পার আগে থেকেই আছে, ব্যবহারকারীর জন্য গ্রুপ-তৈরি মোডাল যোগ করা বাকি)
  - ⚠️ **নোট**: গ্রুপ চ্যাট UI যোগ করার সময় `calls.js`-এর গ্রুপ-কল সিগন্যালিং একটু বাড়াতে হবে। বর্তমানে ৩+ অংশগ্রহণকারীর কলে caller প্রত্যেকের সাথে আলাদাভাবে অফার পাঠায় (star টপোলজি), কিন্তু non-caller অংশগ্রহণকারীরা একে অপরের সাথে সরাসরি সংযুক্ত হয় না (`peer-join` সিগন্যাল শুধু মূল caller-কে পাঠানো হয়, অন্য সবাইকে broadcast হয় না) — অর্থাৎ পূর্ণ mesh না, তাই ৩ জনের বেশি হলে সবাই সবাইকে শুনতে/দেখতে নাও পারে। যেহেতু এখন গ্রুপ চ্যাট তৈরির কোনো UI নেই, এই পাথ বর্তমানে অ্যাক্সেসযোগ্য না, তাই এখনই ফিক্স করা হয়নি — কিন্তু গ্রুপ চ্যাট UI যোগ করার সময় এটাও ঠিক করতে হবে (প্রতিটা `peer-join` broadcast সব বিদ্যমান participant-কে পাঠাতে হবে, শুধু offer-প্রেরককে না)।
- এন্ড-টু-এন্ড এনক্রিপশন (বর্তমানে Supabase RLS দিয়ে অ্যাক্সেস কন্ট্রোল করা হয়, কিন্তু মেসেজ সার্ভারে প্লেইনটেক্সট থাকে)
- মেসেজ সার্চ
- কল রেকর্ডিং
