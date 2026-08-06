-- =====================================================================
-- Waves — Supabase schema
-- Supabase Dashboard > SQL Editor এ পুরো ফাইলটা রান করুন (একবারই যথেষ্ট)
-- =====================================================================

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text not null default 'User',
  avatar_url text,
  is_online boolean not null default false,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by any authenticated user"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ---------- chats ----------
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chats enable row level security;

create policy "members can read their chats"
  on public.chats for select
  using (
    exists (
      select 1 from public.chat_members cm
      where cm.chat_id = chats.id and cm.user_id = auth.uid()
    )
  );

create policy "authenticated users can create chats"
  on public.chats for insert
  with check (auth.uid() = created_by);

-- ---------- chat_members ----------
create table if not exists public.chat_members (
  chat_id uuid references public.chats(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

alter table public.chat_members enable row level security;

create policy "members can read their own membership rows"
  on public.chat_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.chat_members cm2
      where cm2.chat_id = chat_members.chat_id and cm2.user_id = auth.uid()
    )
  );

create policy "authenticated users can add chat members"
  on public.chat_members for insert
  with check (auth.uid() is not null);

-- ---------- messages ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "members can read messages in their chats"
  on public.messages for select
  using (
    exists (
      select 1 from public.chat_members cm
      where cm.chat_id = messages.chat_id and cm.user_id = auth.uid()
    )
  );

create policy "members can send messages in their chats"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_members cm
      where cm.chat_id = messages.chat_id and cm.user_id = auth.uid()
    )
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
