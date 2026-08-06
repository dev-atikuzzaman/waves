-- =====================================================================
-- Waves — Migration 5: Premium messaging + call history + group calls
-- Supabase Dashboard > SQL Editor এ রান করুন।
-- ইতিমধ্যে schema.sql (full) রান করে থাকলে এই ফাইলটা আলাদা করে রান করার
-- দরকার নেই — schema.sql-এ সব যোগ করা আছে। এটা শুধু আগে থেকে চলমান
-- ডাটাবেসে ইনক্রিমেন্টাল আপডেটের জন্য।
-- =====================================================================

-- messages টেবিলে নতুন কলাম
alter table public.messages add column if not exists kind text not null default 'text';
alter table public.messages add column if not exists attachment_url text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_size integer;
alter table public.messages add column if not exists attachment_duration numeric;
alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz,
  seen_at timestamptz,
  primary key (message_id, user_id)
);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.chats(id) on delete set null,
  caller_id uuid not null references public.profiles(id),
  is_video boolean not null default false,
  is_group boolean not null default false,
  status text not null default 'missed',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer
);

create table if not exists public.call_participants (
  call_id uuid not null references public.call_logs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz,
  left_at timestamptz,
  primary key (call_id, user_id)
);

alter table public.message_receipts enable row level security;
alter table public.message_reactions enable row level security;
alter table public.call_logs enable row level security;
alter table public.call_participants enable row level security;

drop policy if exists "members can read receipts in their chats" on public.message_receipts;
create policy "members can read receipts in their chats"
  on public.message_receipts for select
  using (exists (select 1 from public.messages m where m.id = message_receipts.message_id and public.is_chat_member(m.chat_id, auth.uid())));

drop policy if exists "users can upsert their own receipts" on public.message_receipts;
create policy "users can upsert their own receipts"
  on public.message_receipts for insert with check (user_id = auth.uid());

drop policy if exists "users can update their own receipts" on public.message_receipts;
create policy "users can update their own receipts"
  on public.message_receipts for update using (user_id = auth.uid());

drop policy if exists "members can read reactions in their chats" on public.message_reactions;
create policy "members can read reactions in their chats"
  on public.message_reactions for select
  using (exists (select 1 from public.messages m where m.id = message_reactions.message_id and public.is_chat_member(m.chat_id, auth.uid())));

drop policy if exists "users can add their own reactions" on public.message_reactions;
create policy "users can add their own reactions"
  on public.message_reactions for insert with check (user_id = auth.uid());

drop policy if exists "users can remove their own reactions" on public.message_reactions;
create policy "users can remove their own reactions"
  on public.message_reactions for delete using (user_id = auth.uid());

drop policy if exists "users can update their own reactions" on public.message_reactions;
create policy "users can update their own reactions"
  on public.message_reactions for update using (user_id = auth.uid());

drop policy if exists "senders can update their own messages" on public.messages;
create policy "senders can update their own messages"
  on public.messages for update using (sender_id = auth.uid());

drop policy if exists "participants can read call logs" on public.call_logs;
create policy "participants can read call logs"
  on public.call_logs for select
  using (caller_id = auth.uid() or exists (select 1 from public.call_participants cp where cp.call_id = call_logs.id and cp.user_id = auth.uid()));

drop policy if exists "authenticated users can create call logs" on public.call_logs;
create policy "authenticated users can create call logs"
  on public.call_logs for insert with check (caller_id = auth.uid());

drop policy if exists "caller can update their call logs" on public.call_logs;
create policy "caller can update their call logs"
  on public.call_logs for update
  using (caller_id = auth.uid() or exists (select 1 from public.call_participants cp where cp.call_id = call_logs.id and cp.user_id = auth.uid()));

drop policy if exists "participants can read call participant rows" on public.call_participants;
create policy "participants can read call participant rows"
  on public.call_participants for select
  using (user_id = auth.uid() or exists (select 1 from public.call_logs cl where cl.id = call_participants.call_id and cl.caller_id = auth.uid()));

drop policy if exists "authenticated users can add call participants" on public.call_participants;
create policy "authenticated users can add call participants"
  on public.call_participants for insert with check (auth.uid() is not null);

drop policy if exists "participants can update their own participant row" on public.call_participants;
create policy "participants can update their own participant row"
  on public.call_participants for update using (user_id = auth.uid());

alter publication supabase_realtime add table public.message_receipts;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.call_logs;

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
