-- ============================================================================
-- GLOBALPULSE — COMMUNITY LOCATION SHARING SCHEMA
-- Run this once in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES — public info attached to each auth user
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_color text not null default '#06b6d4',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. USER LOCATIONS — one live-location row per profile
--    (FK points at profiles so PostgREST can join username/avatar_color)
-- ---------------------------------------------------------------------------
create table if not exists public.user_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null,
  lon double precision not null,
  city text,
  country text,
  country_code text,
  precision_mode text not null default 'precise'
    check (precision_mode in ('precise', 'city')),
  sharing_enabled boolean not null default true,
  last_seen timestamptz not null default now()
);

create index if not exists idx_user_locations_last_seen
  on public.user_locations (last_seen desc);

-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_locations enable row level security;

-- Profiles: readable by everyone, writable only by the owner
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id);

-- Locations: visible to others ONLY while sharing_enabled = true;
-- owners always see their own row and are the only ones who can change it
drop policy if exists "locations_select" on public.user_locations;
create policy "locations_select" on public.user_locations
  for select using (sharing_enabled = true or auth.uid() = user_id);

drop policy if exists "locations_insert" on public.user_locations;
create policy "locations_insert" on public.user_locations
  for insert with check (auth.uid() = user_id);

drop policy if exists "locations_update" on public.user_locations;
create policy "locations_update" on public.user_locations
  for update using (auth.uid() = user_id);

drop policy if exists "locations_delete" on public.user_locations;
create policy "locations_delete" on public.user_locations
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. REALTIME — broadcast location changes to all connected clients
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'user_locations'
  ) then
    alter publication supabase_realtime add table public.user_locations;
  end if;
end $$;
