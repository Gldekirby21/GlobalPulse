-- ============================================================================
-- GLOBALPULSE — MASTER DATABASE SCHEMA (ALL-IN-ONE)
-- Run this once in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES (Base + Gamification + Social Bio + Cover)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text,
  bio text,
  avatar_color text not null default '#06b6d4',
  avatar_url text,
  cover_url text,
  home_country text,
  home_city text,
  travel_style text,
  dream_destination text,
  website_or_social text,
  xp integer not null default 0,
  badges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

-- Ensure all columns exist if table was already created earlier
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists cover_url text,
  add column if not exists home_country text,
  add column if not exists home_city text,
  add column if not exists travel_style text,
  add column if not exists dream_destination text,
  add column if not exists website_or_social text,
  add column if not exists xp integer not null default 0,
  add column if not exists badges jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz default now();

-- ---------------------------------------------------------------------------
-- 2. USER LOCATIONS (Live Map Presence & Radar)
-- ---------------------------------------------------------------------------
create table if not exists public.user_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null,
  lon double precision not null,
  city text,
  country text,
  country_code text,
  precision_mode text not null default 'precise' check (precision_mode in ('precise', 'city')),
  sharing_enabled boolean not null default true,
  last_seen timestamptz not null default now()
);

create index if not exists idx_user_locations_last_seen
  on public.user_locations (last_seen desc);

-- ---------------------------------------------------------------------------
-- 3. TRAVEL SOCIAL FEED & POSTS
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  image_url text,
  location_name text,
  location_cca3 text,
  feeling_activity text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_posts_created_at
  on public.posts (created_at desc);

create index if not exists idx_posts_user_id
  on public.posts (user_id);

-- Post Reactions
create table if not exists public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'love', 'fire', 'wanderlust', 'wow')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists idx_post_reactions_post_id
  on public.post_reactions (post_id);

-- Post Comments
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_post_comments_post_id
  on public.post_comments (post_id, created_at asc);

-- ---------------------------------------------------------------------------
-- 4. 24-HOUR TRAVEL STORIES
-- ---------------------------------------------------------------------------
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_url text not null,
  caption text,
  location_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists idx_stories_expires_at
  on public.stories (expires_at desc);

-- ---------------------------------------------------------------------------
-- 5. MESSAGES & FRIENDSHIPS (Full Messenger)
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
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
-- 6. NOTIFICATIONS
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action_type text not null,
  post_id uuid references public.posts(id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient
  on public.notifications (recipient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. QUIZ SCORES & PASSPORT VISITS
-- ---------------------------------------------------------------------------
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

create table if not exists public.visited_countries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cca3 text not null,
  visited_at timestamptz not null default now(),
  primary key (user_id, cca3)
);

-- ---------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_locations enable row level security;
alter table public.posts enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_comments enable row level security;
alter table public.stories enable row level security;
alter table public.messages enable row level security;
alter table public.friendships enable row level security;
alter table public.notifications enable row level security;
alter table public.quiz_scores enable row level security;
alter table public.visited_countries enable row level security;

-- Profiles Policies
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Locations Policies
drop policy if exists "locations_select" on public.user_locations;
create policy "locations_select" on public.user_locations for select using (sharing_enabled = true or auth.uid() = user_id);

drop policy if exists "locations_insert" on public.user_locations;
create policy "locations_insert" on public.user_locations for insert with check (auth.uid() = user_id);

drop policy if exists "locations_update" on public.user_locations;
create policy "locations_update" on public.user_locations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "locations_delete" on public.user_locations;
create policy "locations_delete" on public.user_locations for delete using (auth.uid() = user_id);

-- Posts Policies
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts for select using (true);

drop policy if exists "posts_insert" on public.posts;
create policy "posts_insert" on public.posts for insert with check (auth.uid() = user_id);

drop policy if exists "posts_update" on public.posts;
create policy "posts_update" on public.posts for update using (auth.uid() = user_id);

drop policy if exists "posts_delete" on public.posts;
create policy "posts_delete" on public.posts for delete using (auth.uid() = user_id);

-- Reactions Policies
drop policy if exists "reactions_select" on public.post_reactions;
create policy "reactions_select" on public.post_reactions for select using (true);

drop policy if exists "reactions_insert" on public.post_reactions;
create policy "reactions_insert" on public.post_reactions for insert with check (auth.uid() = user_id);

drop policy if exists "reactions_delete" on public.post_reactions;
create policy "reactions_delete" on public.post_reactions for delete using (auth.uid() = user_id);

-- Comments Policies
drop policy if exists "comments_select" on public.post_comments;
create policy "comments_select" on public.post_comments for select using (true);

drop policy if exists "comments_insert" on public.post_comments;
create policy "comments_insert" on public.post_comments for insert with check (auth.uid() = user_id);

drop policy if exists "comments_delete" on public.post_comments;
create policy "comments_delete" on public.post_comments for delete using (auth.uid() = user_id);

-- Stories Policies
drop policy if exists "stories_select" on public.stories;
create policy "stories_select" on public.stories for select using (true);

drop policy if exists "stories_insert" on public.stories;
create policy "stories_insert" on public.stories for insert with check (auth.uid() = user_id);

drop policy if exists "stories_delete" on public.stories;
create policy "stories_delete" on public.stories for delete using (auth.uid() = user_id);

-- Messages Policies
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert with check (auth.uid() = sender_id);

drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages for update using (auth.uid() = recipient_id);

-- Friendships Policies
drop policy if exists "friends_select" on public.friendships;
create policy "friends_select" on public.friendships for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "friends_insert" on public.friendships;
create policy "friends_insert" on public.friendships for insert with check (auth.uid() = requester_id);

drop policy if exists "friends_update" on public.friendships;
create policy "friends_update" on public.friendships for update using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "friends_delete" on public.friendships;
create policy "friends_delete" on public.friendships for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Notifications Policies
drop policy if exists "notifs_select" on public.notifications;
create policy "notifs_select" on public.notifications for select using (auth.uid() = recipient_id);

drop policy if exists "notifs_insert" on public.notifications;
create policy "notifs_insert" on public.notifications for insert with check (true);

drop policy if exists "notifs_update" on public.notifications;
create policy "notifs_update" on public.notifications for update using (auth.uid() = recipient_id);

-- Quiz Scores Policies
drop policy if exists "quiz_select" on public.quiz_scores;
create policy "quiz_select" on public.quiz_scores for select using (true);

drop policy if exists "quiz_insert" on public.quiz_scores;
create policy "quiz_insert" on public.quiz_scores for insert with check (auth.uid() = user_id);

-- Visited Countries Policies
drop policy if exists "visits_select" on public.visited_countries;
create policy "visits_select" on public.visited_countries for select using (true);

drop policy if exists "visits_insert" on public.visited_countries;
create policy "visits_insert" on public.visited_countries for insert with check (auth.uid() = user_id);

drop policy if exists "visits_delete" on public.visited_countries;
create policy "visits_delete" on public.visited_countries for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 9. REALTIME REPLICATION ENABLE
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'user_locations') then
    alter publication supabase_realtime add table public.user_locations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'posts') then
    alter publication supabase_realtime add table public.posts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'post_reactions') then
    alter publication supabase_realtime add table public.post_reactions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'post_comments') then
    alter publication supabase_realtime add table public.post_comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'stories') then
    alter publication supabase_realtime add table public.stories;
  end if;
end $$;
