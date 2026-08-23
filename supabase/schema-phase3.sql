-- ============================================================================
-- GLOBALPULSE — PHASE 3 SOCIAL & ENGAGEMENT SCHEMA
-- Facebook-Style Travel Feed, Reactions, Comments, Stories & Notifications
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES ENHANCEMENT — Cover Photo Banner
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists cover_url text;

-- ---------------------------------------------------------------------------
-- 2. TRAVEL POSTS — News feed & travel logs
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 3000),
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

create index if not exists idx_posts_location_cca3
  on public.posts (location_cca3);

-- ---------------------------------------------------------------------------
-- 3. POST REACTIONS — Like, Love, Fire, Wanderlust, Wow
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4. POST COMMENTS — Threaded discussions
-- ---------------------------------------------------------------------------
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment_text text not null check (char_length(comment_text) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists idx_post_comments_post_id
  on public.post_comments (post_id, created_at asc);

-- ---------------------------------------------------------------------------
-- 5. NOTIFICATIONS — Real-time social alerts
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action_type text not null check (action_type in ('like', 'comment', 'friend_request', 'friend_accept', 'badge_unlock', 'mention')),
  post_id uuid references public.posts(id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient
  on public.notifications (recipient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. PULSE STORIES — 24-Hour travel snapshots
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
-- 7. ROW LEVEL SECURITY POLICIES
-- ---------------------------------------------------------------------------
alter table public.posts enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_comments enable row level security;
alter table public.notifications enable row level security;
alter table public.stories enable row level security;

-- Posts Policies
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts
  for select using (true);

drop policy if exists "posts_insert" on public.posts;
create policy "posts_insert" on public.posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "posts_update" on public.posts;
create policy "posts_update" on public.posts
  for update using (auth.uid() = user_id);

drop policy if exists "posts_delete" on public.posts;
create policy "posts_delete" on public.posts
  for delete using (auth.uid() = user_id);

-- Post Reactions Policies
drop policy if exists "reactions_select" on public.post_reactions;
create policy "reactions_select" on public.post_reactions
  for select using (true);

drop policy if exists "reactions_insert" on public.post_reactions;
create policy "reactions_insert" on public.post_reactions
  for insert with check (auth.uid() = user_id);

drop policy if exists "reactions_delete" on public.post_reactions;
create policy "reactions_delete" on public.post_reactions
  for delete using (auth.uid() = user_id);

-- Post Comments Policies
drop policy if exists "comments_select" on public.post_comments;
create policy "comments_select" on public.post_comments
  for select using (true);

drop policy if exists "comments_insert" on public.post_comments;
create policy "comments_insert" on public.post_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "comments_delete" on public.post_comments;
create policy "comments_delete" on public.post_comments
  for delete using (auth.uid() = user_id);

-- Notifications Policies
drop policy if exists "notifs_select" on public.notifications;
create policy "notifs_select" on public.notifications
  for select using (auth.uid() = recipient_id);

drop policy if exists "notifs_insert" on public.notifications;
create policy "notifs_insert" on public.notifications
  for insert with check (true);

drop policy if exists "notifs_update" on public.notifications;
create policy "notifs_update" on public.notifications
  for update using (auth.uid() = recipient_id);

drop policy if exists "notifs_delete" on public.notifications;
create policy "notifs_delete" on public.notifications
  for delete using (auth.uid() = recipient_id);

-- Stories Policies
drop policy if exists "stories_select" on public.stories;
create policy "stories_select" on public.stories
  for select using (expires_at > now());

drop policy if exists "stories_insert" on public.stories;
create policy "stories_insert" on public.stories
  for insert with check (auth.uid() = user_id);

drop policy if exists "stories_delete" on public.stories;
create policy "stories_delete" on public.stories
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 8. ENABLE REALTIME SUBSCRIPTIONS
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.post_reactions;
alter publication supabase_realtime add table public.post_comments;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.stories;
