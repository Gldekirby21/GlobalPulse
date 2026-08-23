-- ============================================================================
-- GLOBALPULSE — PHASE 2 ENGAGEMENT SCHEMA
-- Gamification, Travel Journal & Social features
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- (Requires schema.sql from the community feature to be run first.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. GAMIFICATION — XP + badges live on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists xp integer not null default 0;

alter table public.profiles
  add column if not exists badges jsonb not null default '[]'::jsonb;

-- Quiz rounds
create table if not exists public.quiz_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null,
  correct integer not null,
  total integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_quiz_scores_score
  on public.quiz_scores (score desc);

-- ---------------------------------------------------------------------------
-- 2. TRAVEL JOURNAL — passport stamps
-- ---------------------------------------------------------------------------
create table if not exists public.visited_countries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cca3 text not null,
  visited_at timestamptz not null default now(),
  primary key (user_id, cca3)
);

-- ---------------------------------------------------------------------------
-- 3. SOCIAL — direct messages + friendships
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_recipient
  on public.messages (recipient_id, created_at desc);

create table if not exists public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id)
);

-- ---------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table public.quiz_scores enable row level security;
alter table public.visited_countries enable row level security;
alter table public.messages enable row level security;
alter table public.friendships enable row level security;

-- Quiz scores: everyone reads the leaderboard, only owner writes
drop policy if exists "quiz_select" on public.quiz_scores;
create policy "quiz_select" on public.quiz_scores
  for select using (true);

drop policy if exists "quiz_insert" on public.quiz_scores;
create policy "quiz_insert" on public.quiz_scores
  for insert with check (auth.uid() = user_id);

drop policy if exists "quiz_delete" on public.quiz_scores;
create policy "quiz_delete" on public.quiz_scores
  for delete using (auth.uid() = user_id);

-- Passport stamps: public read (profile cards), owner writes
drop policy if exists "visits_select" on public.visited_countries;
create policy "visits_select" on public.visited_countries
  for select using (true);

drop policy if exists "visits_insert" on public.visited_countries;
create policy "visits_insert" on public.visited_countries
  for insert with check (auth.uid() = user_id);

drop policy if exists "visits_delete" on public.visited_countries;
create policy "visits_delete" on public.visited_countries
  for delete using (auth.uid() = user_id);

-- Messages: participants only (Realtime respects RLS too)
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert with check (auth.uid() = sender_id);

drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages
  for update using (auth.uid() = recipient_id);

-- Friendships: visible to both parties; requests created by requester;
-- either party may update (accept/decline) or remove
drop policy if exists "friends_select" on public.friendships;
create policy "friends_select" on public.friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "friends_insert" on public.friendships;
create policy "friends_insert" on public.friendships
  for insert with check (auth.uid() = requester_id and status = 'pending');

drop policy if exists "friends_update" on public.friendships;
create policy "friends_update" on public.friendships
  for update using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "friends_delete" on public.friendships;
create policy "friends_delete" on public.friendships
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ---------------------------------------------------------------------------
-- 5. REALTIME — leaderboard + chat broadcasts
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'quiz_scores'
  ) then
    alter publication supabase_realtime add table public.quiz_scores;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
