# GlobalPulse — Engagement Features Master Plan (All 4 Packs)

## Goal

Maximize user retention with gamification, social interaction, travel journaling,
and practical utilities — building on the existing Supabase auth + realtime stack.

---

## GUEST vs LOGGED-IN EXPERIENCE MATRIX

| Feature | 🕵️ Guest (Not Logged In) | 👤 Logged In |
| --- | --- | --- |
| Explore Countries (browse/search/detail) | ✅ Full | ✅ Full |
| Map & Geocoder (search, reverse geocode, layers) | ✅ Full | ✅ Full |
| Distance Calculator | ✅ Full | ✅ Full |
| AI Geo Guide | ✅ Full | ✅ Full |
| Bucket List / Favorites | ✅ Device-only (localStorage) | ✅ Device-only (future: sync) |
| Own location marker (IP + GPS pulse) | ✅ Yes | ✅ Yes |
| Weather chip & Currency Converter | ✅ Yes | ✅ Yes |
| Geo Quiz | ✅ Playable (scores kept locally) | ✅ Scores saved + ranked on leaderboard |
| Leaderboard | 👀 Viewable (read-only teaser) | ✅ Viewable + your row highlighted |
| Community explorers on map | 🔒 Teaser only — blurred markers + "N explorers online — Sign in to connect" | ✅ Full markers, names, popups, distance |
| Community Pulse sidebar list | 🔒 Locked panel with sign-in CTA | ✅ Live list + Everyone/Friends tabs |
| Chat / Pings | ❌ Hidden (header button shows lock → opens auth modal) | ✅ Full DM drawer + unread badges |
| Friends system | ❌ Hidden | ✅ Add/accept friends, friends-only filter |
| Passport Stamps | 🔒 Visible but locked (🔒 overlay + "Sign in to stamp") | ✅ Stamp countries, heatmap, stats |
| XP / Levels / Badges | ❌ Not tracked | ✅ Earned + shown on avatar ring |
| Public Profile Card | 👀 Can VIEW others' shared links | ✅ View own + copy share link |
| Location sharing controls | ❌ N/A (nothing shared) | ✅ Sharing toggle + precision mode |

### Gating Mechanics

- Single helper `isAuthenticated()` (from supabaseService.user) checked by every gated component.
- **Lock-overlay pattern**: gated panels render normally but with a `.feature-locked`
  blur overlay + 🔒 "Sign in to unlock" button that opens the auth modal — guests always
  see WHAT they're missing (conversion driver), never get it free.
- **Community teaser**: when logged out, mapManager renders blurred community markers
  (no names/popups) plus an accurate online-count — curiosity without leaking data.
- Quiz runs fully offline-scored for guests; submitting to leaderboard prompts login.
- All gating is cosmetic/client-side; real security stays in Supabase RLS policies.

## Implementation Order

Phase 1 (Gamification) → Phase 2 (Travel Journal) → Phase 3 (Social) → Phase 4 (Utilities)
*Journal before Social because badges reward visited-country milestones.*

---

## PHASE 1 — Gamification Pack

### Geo Quiz Game (new "Quiz Arena" tab)

- File: `js/components/geoQuiz.js`
- 3 question types from existing `data/countries.json`: capital→country,
  country→capital, flag→country (flagcdn images)
- 10 random questions per round, 4 choices each, 15-second timer per question
- Score = correct×100 + time bonus (up to 50/q); XP earned = score ÷ 10
- End-of-round summary + "Play again"; requires login to submit scores
  (guests can play, scores marked local-only)

### Leaderboard

- New table `quiz_scores` (user_id, score, correct, total, created_at)
- Top-20 panel beside the quiz, refreshed via Supabase Realtime
- Highlights the logged-in user's row

### XP, Levels & Badges

- Columns on `profiles`: `xp int default 0`, `badges jsonb default '[]'`
- Levels: Explorer (0) → Navigator (250 XP) → Cartographer (750) → Globetrotter (2000) → Legend (5000)
- Level ring shown on avatar-dot and account menu
- Badge catalog (stored as string keys): `first_login`, `quiz_first_round`,
  `quiz_500`, `streak_3`, `visited_5`, `visited_25`, `chatty` (10 messages),
  `globetrotter_1000km`
- Service: `js/services/gamificationService.js` (awardXp, checkBadges, fetchLeaderboard)

---

## PHASE 2 — Travel Journal Pack

### Passport Stamps

- New table `visited_countries` (user_id, cca3, visited_at; PK user_id+cca3)
- "🏛 Stamp as Visited" button inside every country detail modal
- New Passport view (inside account menu → "My Passport"):
  - World map with colored markers for visited countries (existing latlng data)
  - Stats: X / 250 countries (Y%), regions covered
  - Grid of stamp cards (flag + name + date)
- Feeds badges: `visited_5`, `visited_25`

### Public Profile Card

- Shareable URL: `index.html?explorer=<uuid>` opens a read-only card modal
  (avatar, level ring, XP, badges, visited count, member since)
- "Copy Profile Link" button in account menu

---

## PHASE 3 — Social Pack

### Direct Messages / Pings

- New table `messages` (id, sender_id, recipient_id, body, read, created_at)
- Slide-in chat drawer (right side) opened from:
  community marker popup "💬 Message" button, community list items,
  and an unread-messages badge in the header
- Realtime subscription filtered to conversations involving me
- Unread counter per conversation + total badge on the header chat button
- Feeds `chatty` badge at 10 sent messages

### Friends System

- New table `friendships` (requester_id, addressee_id, status pending|accepted)
- Community panel gets tabs: **Everyone | Friends**
- Add-friend button on other explorers' popups/profile cards;
  incoming requests appear in the chat drawer "Requests" section (accept/decline)
- Map filter checkbox: show friends only

---

## PHASE 4 — Utilities Pack

### Weather Overlay

- Service: `js/services/weatherService.js`
- API: Open-Meteo current weather — free, NO API key
  `https://api.open-meteo.com/v1/forecast?latitude=&longitude=&current_weather=true`
- Weather chip (icon + °C) added to the hero location card
- Small weather icon injected into community marker popups (lazy, 30-min cache)

### Currency Converter

- Component: `js/components/currencyConverter.js` in the Compare tab sidebar
- API: `https://open.er-api.com/v6/latest/<BASE>` — free, no key, cached 24 h
- Amount + From/To selects auto-populated from countries' currency codes

### PWA (Installable App)

- Root `manifest.json` (name, theme colors matching both themes, 🌍 SVG icon)
- Root `sw.js`: cache-first for static assets, network-first for API calls
- Register SW + `<link rel="manifest">` in index.html

---

## Database Migration (single file: `supabase/schema-phase2.sql`)

```sql
alter table public.profiles
  add column if not exists xp integer not null default 0,
  add column if not exists badges jsonb not null default '[]';

create table if not exists public.quiz_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  score int not null, correct int not null, total int not null,
  created_at timestamptz not null default now()
);

create table if not exists public.visited_countries (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cca3 text not null, visited_at timestamptz not null default now(),
  primary key (user_id, cca3)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id)
);
-- + RLS policies per table (own-row writes, participant reads)
-- + realtime publications for quiz_scores, messages
```

## New Files Summary

| File | Purpose |
| --- | --- |
| `supabase/schema-phase2.sql` | All Phase 1–3 tables + RLS + realtime |
| `js/services/gamificationService.js` | XP, levels, badges, leaderboard |
| `js/components/geoQuiz.js` | Quiz Arena game |
| `js/components/passport.js` | Visited countries view + stats |
| `js/components/chatPanel.js` | DM drawer + friend requests |
| `js/services/weatherService.js` | Open-Meteo wrapper w/ cache |
| `js/components/currencyConverter.js` | Exchange-rate converter |
| `manifest.json`, `sw.js` | PWA support |

## Modified Files

`index.html` (Quiz tab, chat drawer, passport modal, manifest link),
`js/app.js` (wiring all components), `css/style.css` (all new UI, both themes),
`css/leaflet-custom.css` (weather icons in popups), `README.md` (setup guide).
