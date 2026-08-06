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
  created_at timestamptz not null default now()
);

-- ---------- STEP 2: RLS চালু করুন ----------
alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;

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

-- ---------- realtime ----------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.profiles;

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
