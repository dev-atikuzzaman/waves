-- =====================================================================
-- Waves — Supabase schema
-- Supabase Dashboard > SQL Editor এ পুরো ফাইলটা রান করুন (একবারই যথেষ্ট)
-- =====================================================================

-- ---------- STEP 1: সব টেবিল আগে তৈরি করুন ----------
-- (পলিসিগুলো অন্য টেবিল রেফারেন্স করে বলে, রেফারেন্সড টেবিল আগে থাকা লাগবে)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text not null default 'User',
  avatar_url text,
  is_online boolean not null default false,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  chat_id uuid references public.chats(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null,
  kind text not null default 'text', -- 'text' | 'voice' | 'file' | 'image'
  attachment_url text,
  attachment_name text,
  attachment_size integer,
  attachment_duration numeric, -- seconds, for voice notes
  reply_to_id uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- প্রতিটি মেসেজের delivered/seen অবস্থা প্রতিটি প্রাপকের জন্য আলাদাভাবে ট্র্যাক করে
create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz,
  seen_at timestamptz,
  primary key (message_id, user_id)
);

-- মেসেজ রিয়েকশন (❤️ 👍 😂 ইত্যাদি), প্রতি ইউজার প্রতি মেসেজে একটাই রিয়েকশন
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- টাইপিং ইন্ডিকেটরের জন্য (broadcast-only হলেও চাইলে persist করা যায়; এখানে না রাখলেও চলে,
-- realtime broadcast দিয়েই টাইপিং হবে — তাই আলাদা টেবিল দরকার নেই)

-- কল হিস্ট্রি / মিসড কল লগ
create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.chats(id) on delete set null,
  caller_id uuid not null references public.profiles(id),
  is_video boolean not null default false,
  is_group boolean not null default false,
  status text not null default 'missed', -- 'missed' | 'answered' | 'declined' | 'ended'
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer
);

-- কল লগের প্রতিটি অংশগ্রহণকারী (গ্রুপ কল সহ)
create table if not exists public.call_participants (
  call_id uuid not null references public.call_logs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz,
  primary key (call_id, user_id)
);

-- Web Push সাবস্ক্রিপশন — অ্যাপ বন্ধ/ব্যাকগ্রাউন্ডে থাকলেও কল/মেসেজ নোটিফিকেশন পাঠানোর জন্য।
-- এক ইউজারের একাধিক ডিভাইস/ব্রাউজার থাকতে পারে, তাই endpoint-ভিত্তিক আলাদা রো।
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ---------- STEP 2: RLS চালু করুন ----------
alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_receipts enable row level security;
alter table public.message_reactions enable row level security;
alter table public.call_logs enable row level security;
alter table public.call_participants enable row level security;
alter table public.push_subscriptions enable row level security;

-- ---------- STEP 2.5: হেল্পার ফাংশন ----------
-- chat_members-এর নিজের উপর RLS পলিসি সরাসরি chat_members কোয়েরি করলে
-- "infinite recursion detected in policy" এরর হয়। security definer ফাংশন
-- RLS বাইপাস করে চেক করে, তাই recursion হয় না।
create or replace function public.is_chat_member(p_chat_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.chat_members
    where chat_id = p_chat_id and user_id = p_user_id
  );
$$;

-- ---------- STEP 3: পলিসি — এখন সব টেবিল বিদ্যমান, তাই cross-reference নিরাপদ ----------

-- profiles
drop policy if exists "profiles are readable by any authenticated user" on public.profiles;
create policy "profiles are readable by any authenticated user"
  on public.profiles for select
  using (auth.role() = 'authenticated');

drop policy if exists "users can insert their own profile" on public.profiles;
create policy "users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- chats
drop policy if exists "members can read their chats" on public.chats;
create policy "members can read their chats"
  on public.chats for select
  using (public.is_chat_member(chats.id, auth.uid()));

drop policy if exists "authenticated users can create chats" on public.chats;
create policy "authenticated users can create chats"
  on public.chats for insert
  with check (auth.uid() = created_by);

-- chat_members (self-reference এড়াতে is_chat_member ফাংশন ব্যবহার)
drop policy if exists "members can read their own membership rows" on public.chat_members;
create policy "members can read their own membership rows"
  on public.chat_members for select
  using (
    user_id = auth.uid()
    or public.is_chat_member(chat_members.chat_id, auth.uid())
  );

drop policy if exists "authenticated users can add chat members" on public.chat_members;
create policy "authenticated users can add chat members"
  on public.chat_members for insert
  with check (auth.uid() is not null);

-- messages
drop policy if exists "members can read messages in their chats" on public.messages;
create policy "members can read messages in their chats"
  on public.messages for select
  using (public.is_chat_member(messages.chat_id, auth.uid()));

drop policy if exists "members can send messages in their chats" on public.messages;
create policy "members can send messages in their chats"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.is_chat_member(messages.chat_id, auth.uid())
  );

-- message_receipts
drop policy if exists "members can read receipts in their chats" on public.message_receipts;
create policy "members can read receipts in their chats"
  on public.message_receipts for select
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_receipts.message_id
      and public.is_chat_member(m.chat_id, auth.uid())
    )
  );

drop policy if exists "users can upsert their own receipts" on public.message_receipts;
create policy "users can upsert their own receipts"
  on public.message_receipts for insert
  with check (user_id = auth.uid());

drop policy if exists "users can update their own receipts" on public.message_receipts;
create policy "users can update their own receipts"
  on public.message_receipts for update
  using (user_id = auth.uid());

-- message_reactions
drop policy if exists "members can read reactions in their chats" on public.message_reactions;
create policy "members can read reactions in their chats"
  on public.message_reactions for select
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
      and public.is_chat_member(m.chat_id, auth.uid())
    )
  );

drop policy if exists "users can add their own reactions" on public.message_reactions;
create policy "users can add their own reactions"
  on public.message_reactions for insert
  with check (user_id = auth.uid());

drop policy if exists "users can remove their own reactions" on public.message_reactions;
create policy "users can remove their own reactions"
  on public.message_reactions for delete
  using (user_id = auth.uid());

drop policy if exists "users can update their own reactions" on public.message_reactions;
create policy "users can update their own reactions"
  on public.message_reactions for update
  using (user_id = auth.uid());

-- messages: edit/delete নিজের মেসেজ
drop policy if exists "senders can update their own messages" on public.messages;
create policy "senders can update their own messages"
  on public.messages for update
  using (sender_id = auth.uid());

-- call_logs
drop policy if exists "participants can read call logs" on public.call_logs;
create policy "participants can read call logs"
  on public.call_logs for select
  using (
    caller_id = auth.uid()
    or exists (
      select 1 from public.call_participants cp
      where cp.call_id = call_logs.id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "authenticated users can create call logs" on public.call_logs;
create policy "authenticated users can create call logs"
  on public.call_logs for insert
  with check (caller_id = auth.uid());

drop policy if exists "caller can update their call logs" on public.call_logs;
create policy "caller can update their call logs"
  on public.call_logs for update
  using (
    caller_id = auth.uid()
    or exists (
      select 1 from public.call_participants cp
      where cp.call_id = call_logs.id and cp.user_id = auth.uid()
    )
  );

-- call_participants
drop policy if exists "participants can read call participant rows" on public.call_participants;
create policy "participants can read call participant rows"
  on public.call_participants for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.call_logs cl
      where cl.id = call_participants.call_id and cl.caller_id = auth.uid()
    )
  );

drop policy if exists "authenticated users can add call participants" on public.call_participants;
create policy "authenticated users can add call participants"
  on public.call_participants for insert
  with check (auth.uid() is not null);

drop policy if exists "participants can update their own participant row" on public.call_participants;
create policy "participants can update their own participant row"
  on public.call_participants for update
  using (user_id = auth.uid());

-- push_subscriptions: প্রত্যেকে শুধু নিজের সাবস্ক্রিপশন ম্যানেজ করতে পারবে
drop policy if exists "users can read their own push subscriptions" on public.push_subscriptions;
create policy "users can read their own push subscriptions"
  on public.push_subscriptions for select
  using (user_id = auth.uid());

drop policy if exists "users can add their own push subscriptions" on public.push_subscriptions;
create policy "users can add their own push subscriptions"
  on public.push_subscriptions for insert
  with check (user_id = auth.uid());

drop policy if exists "users can delete their own push subscriptions" on public.push_subscriptions;
create policy "users can delete their own push subscriptions"
  on public.push_subscriptions for delete
  using (user_id = auth.uid());

-- ---------- realtime (idempotent — আগে থেকে যোগ করা থাকলে স্কিপ করে) ----------
do $$
declare
  tbl text;
begin
  foreach tbl in array array['messages', 'profiles', 'message_receipts', 'message_reactions', 'call_logs']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;

-- ---------- STORAGE: ভয়েস নোট ও ফাইল শেয়ারের জন্য বাকেট ----------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

drop policy if exists "authenticated users can upload attachments" on storage.objects;
create policy "authenticated users can upload attachments"
  on storage.objects for insert
  with check (bucket_id = 'attachments' and auth.role() = 'authenticated');

drop policy if exists "anyone can read attachments" on storage.objects;
create policy "anyone can read attachments"
  on storage.objects for select
  using (bucket_id = 'attachments');

drop policy if exists "owners can delete their attachments" on storage.objects;
create policy "owners can delete their attachments"
  on storage.objects for delete
  using (bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------- keep chats.updated_at fresh on new message ----------
create or replace function public.touch_chat_updated_at()
returns trigger as $$
begin
  update public.chats set updated_at = now() where id = new.chat_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_touch_chat on public.messages;
create trigger trg_touch_chat
  after insert on public.messages
  for each row execute function public.touch_chat_updated_at();

-- =====================================================================
-- STEP 4: Web Push ট্রিগার — নতুন মেসেজ/কল হলে Edge Function কল করে
-- push_subscriptions-এ থাকা ডিভাইসগুলোতে নোটিফিকেশন পাঠানো হয়।
-- এর জন্য pg_net এক্সটেনশন লাগবে (Supabase-এ ডিফল্ট এনাবল করা থাকে)।
--
-- ⚠️ গুরুত্বপূর্ণ: এখানে URL/secret সরাসরি ফাংশনের ভেতরে হার্ডকোড করা হয়
-- (আগে `current_setting('app.settings.x')` দিয়ে করা হতো, কিন্তু Supabase-এ
-- session-level GUC অনেক সময় নতুন কানেকশনে propagate হয় না, ফলে ট্রিগার
-- নীরবে স্কিপ হয়ে যেত এবং পুশ কখনোই পাঠানো হতো না — কোনো এরর ছাড়াই)।
--
-- নিচের STEP 4 রান করার আগে দুই জায়গায় বসান:
--   ১) <PROJECT_REF> কে আপনার Supabase প্রজেক্ট রেফ দিয়ে বদলান
--   ২) <WEBHOOK_SECRET> কে আপনার supabase secrets set WEBHOOK_SECRET=... এ
--      যেটা বসিয়েছেন ঠিক সেটা দিয়ে বদলান
--
-- 🔴 সিকিউরিটি সতর্কতা: আপনার আগের schema.sql-এ এই দুই প্লেসহোল্ডারের জায়গায়
-- আসল প্রজেক্ট রেফ এবং আসল WEBHOOK_SECRET হার্ডকোড করা অবস্থায় ছিল, এবং ফাইলটা
-- মনে হচ্ছে GitHub রিপোতে কমিট করা হয়েছে। এর মানে ওই সিক্রেটটা এখন এক্সপোজড
-- ধরে নিতে হবে। এই ফাইল আবার রান করার আগে:
--   ১) নতুন সিক্রেট বানান:  openssl rand -hex 32
--   ২) সেটা Edge Function-এ আপডেট করুন:  supabase secrets set WEBHOOK_SECRET=<নতুন-মান>
--   ৩) supabase functions deploy send-push --no-verify-jwt (আবার ডিপ্লয় করুন)
--   ৪) নিচের <WEBHOOK_SECRET> প্লেসহোল্ডারে ওই *নতুন* মান বসান (পুরনোটা না)
-- এবং ভবিষ্যতে .gitignore-এ রিয়েল সিক্রেটসহ ফাইল যোগ করা এড়াতে, schema.sql-এর
-- কপি রিপোতে সবসময় প্লেসহোল্ডার আকারেই রাখুন — লোকাল/প্রোডাকশনে রান করার সময়
-- শুধু SQL Editor-এ সাময়িকভাবে মান বসিয়ে রান করুন, ফাইলে সেভ করে কমিট করবেন না।
-- =====================================================================
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_message()
returns trigger as $$
declare
  -- ⚠️ বাগ ফিক্স: আগে এখানে 'https:' এর পরে '//' মিসিং ছিল (https:muirh...) —
  -- এটা একটা অবৈধ URL, তাই pg_net এর প্রতিটা কল নীরবে ব্যর্থ হচ্ছিল এবং
  -- টেক্সট মেসেজের পুশ নোটিফিকেশন কখনোই যাচ্ছিল না (কোনো এরর ছাড়াই)।
  fn_url text := 'https://muirhdipmymeganwrpgk.supabase.co/functions/v1/send-push';
  fn_secret text := 'f4a8b2c6d9e1f3a5b7c0d2e4f6a8b1c3d5e7f9a2b4c6d8e0f1a3b5c7d9e1f2a4';
begin
  if fn_url like '%muirhdipmymeganwrpgk%' then
    return new; -- এখনো সেটআপ করা হয়নি (উপরের প্লেসহোল্ডার বদলানো হয়নি) — চুপচাপ স্কিপ করুন
  end if;

  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', fn_secret),
    body := jsonb_build_object(
      'type', 'message',
      'record', to_jsonb(new)
    )
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notify_new_message on public.messages;
create trigger trg_notify_new_message
  after insert on public.messages
  for each row execute function public.notify_new_message();

create or replace function public.notify_new_call()
returns trigger as $$
declare
  fn_url text := 'https://muirhdipmymeganwrpgk.supabase.co/functions/v1/send-push';
  fn_secret text := 'f4a8b2c6d9e1f3a5b7c0d2e4f6a8b1c3d5e7f9a2b4c6d8e0f1a3b5c7d9e1f2a4';
begin
  if fn_url like '%muirhdipmymeganwrpgk%' then
    return new;
  end if;

  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', fn_secret),
    body := jsonb_build_object(
      'type', 'call',
      'record', jsonb_build_object(
        'id', new.call_id,
        'target_user_id', new.user_id
      )
    )
  );
  return new;
end;
$$ language plpgsql security definer;

-- ⚠️ আগে এই ট্রিগারটা call_logs-এর insert-এ ছিল, কিন্তু client কোড আগে call_logs
-- রো বানায় এবং *পরে* call_participants রো যোগ করে (addCallParticipant) — অর্থাৎ
-- ট্রিগার call_logs ইনসার্টের সাথে সাথেই ফায়ার হতো, তখনো কোনো participant
-- ডাটাবেসে ছিল না। ফলে Edge Function সবসময় recipientIds খালি পেত এবং কাউকে
-- পুশ পাঠাতো না — অ্যাপ বন্ধ থাকলে কল নোটিফিকেশন না আসার এটাই মূল কারণ।
-- এখন call_participants-এর insert-এ ট্রিগার বসানো হয়েছে, যেটা সবসময় পরে
-- ঘটে এবং প্রতিটা participant রো-এর জন্য আলাদাভাবে ফায়ার হয় (তাই প্রতিটা
-- প্রাপকের জন্য নিশ্চিতভাবে ডেটা থাকে)।
drop trigger if exists trg_notify_new_call on public.call_logs;
drop trigger if exists trg_notify_call_participant on public.call_participants;
create trigger trg_notify_call_participant
  after insert on public.call_participants
  for each row execute function public.notify_new_call();
