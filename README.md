# 🌍 GlobalPulse: Interactive Country & Location Explorer

[![Live Demo](https://img.shields.io/badge/Live_Demo-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://global-pulse-lemon-two.vercel.app/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Gldekirby21/GlobalPulse)

> 🚀 **Live Website:** [GlobalPulse — Interactive Country & Location Explorer](https://global-pulse-lemon-two.vercel.app/)

A state-of-the-art web application that unifies **REST Countries API**, **Nominatim OpenStreetMap Geocoding**, and **HTTPS IP Geolocation** into a fast, interactive geospatial dashboard with **Leaflet.js**, **Country Comparisons**, **Great-Circle Distance Measurement**, and an **AI Travel & Geo Assistant**.

---

## ✨ Features

1. **Auto-Detect User Location (IP Geolocation)**
   - Automatically detects user's country, region, city, ISP, currency, and coordinates upon first load.
   - Centers the interactive Leaflet map and places an animated sonar radar pulse marker on the user's location.

2. **Country Deep-Dive Explorer (REST Countries API v3.1)**
   - Instant search by country name, capital, language, or ISO codes.
   - Filter by continents/regions (Asia, Europe, Americas, Africa, Oceania, Antarctic).
   - Sort by Population, Land Area, or Name.
   - Detailed modal with high-res flag, coat of arms, currencies, driving side, UN membership, timezones, and **clickable shared border countries**.
   - Built-in **Text-to-Speech audio pronunciation** and facts reader.

3. **Smart Address & Coordinate Finder (Nominatim + Leaflet.js)**
   - **Forward Geocoding**: Search any landmark, city, or address (e.g. *"Rizal Park, Manila"*, *"Eiffel Tower, Paris"*) and fly directly there.
   - **Reverse Geocoding**: Click anywhere on the map to retrieve the exact street address, municipality, postal code, and country coordinates.
   - Layer switchers: CartoDB Voyager, Dark Matter, and OpenStreetMap Street tiles.

4. **Country vs Country Comparison Matrix**
   - Side-by-side comparison of any two countries with visual ratio meters for population, land area, population density, currencies, driving side, and UN status.

5. **Great-Circle Distance & Flight Path Calculator (Haversine)**
   - Computes distance in kilometers, miles, and nautical miles between any two nations.
   - Estimates non-stop flight times and draws an animated geodesic flight arc on the map.

6. **AI Geo & Travel Assistant**
   - Built-in instant intelligence engine for travel advice, best seasons, cuisine highlights, and geography facts.
   - Supports optional Google Gemini API Key for dynamic live AI chat.

7. **Travel Bucket List & Favorites**
   - Bookmark dream destinations with offline LocalStorage persistence and JSON export.

---

## 👥 Supabase Setup (Community + Engagement Features)

### Hakbang 1: Gumawa ng Supabase Project

1. Pumunta sa [supabase.com](https://supabase.com) at gumawa ng libreng account.
2. I-click ang **"New Project"** — pumili ng region malapit sa iyo (hal. Singapore).

### Hakbang 2: Patakbuhin ang Database Schemas

1. Sa Supabase Dashboard, buksan ang **SQL Editor → New query**.
2. Kopyahin at patakbuhin ang [`supabase/schema.sql`](supabase/schema.sql) (community base).
3. Patakbuhin din ang [`supabase/schema-phase2.sql`](supabase/schema-phase2.sql) (quiz, passport, chat, friends).

### Hakbang 3: I-enable ang Google Sign-In (opsyonal)

1. Sa [Google Cloud Console](https://console.cloud.google.com), gumawa ng **OAuth Client ID** (Web application).
2. Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Sa Supabase: **Authentication → Providers → Google** → i-paste ang Client ID + Secret.
4. Sa **Authentication → URL Configuration**, idagdag ang site URL mo (hal. `https://globalpulse-explorer.vercel.app`).

### Hakbang 4: Ilagay ang API Keys

Kopyahin ang **Project URL** at **anon public** key mula sa *Project Settings → API* papunta sa [`js/config.js`](js/config.js).

> 🔒 Ligtas ang anon key sa client — pinoprotektahan ng Row Level Security ang lahat ng data.
> 🕵️ Ang mga guest ay nakakakita lang ng blurred community teaser; ang logged-in users ay may buong access sa quiz leaderboard, passport stamps, chat at friends.

### Guest vs Logged-in

- **Guest:** lahat ng core features (countries, map, distance, AI guide, weather, converter) + pwedeng maglaro ng Geo Quiz nang local-score lang.
- **Logged-in:** leaderboard ranking, XP/levels/badges, passport stamps, real-time chat, friends system, at location sharing controls (Exact GPS o City-only precision).

### PWA

Ang `manifest.json` at `sw.js` ay ready na para sa "Install to Home Screen".
Idagdag ang `<link rel="manifest" href="manifest.json" />` sa `<head>` ng index.html kung nais i-enable.
