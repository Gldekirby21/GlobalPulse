# 🌍 GlobalPulse: Interactive Country & Location Explorer

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

## 🚀 Paano I-upload Online Nang Libre (Free Deployment Guide)

Dahil ang system na ito ay ginawa gamit ang modern Vanilla HTML5, CSS, at ES6 JavaScript, **hindi kailangan ng mamahaling server o kumplikadong build step**. Pwede mo itong i-host nang **100% libre** sa mga sumusunod:

---

### Paraan 1: Vercel (Pinakamabilis & Inirerekomenda) ⭐

1. Gumawa ng libreng account sa [vercel.com](https://vercel.com).
2. I-upload ang project folder sa iyong **GitHub** repository (o gamitin ang Vercel CLI).
3. Sa Vercel Dashboard, i-click ang **"Add New Project"** -> Piliin ang iyong GitHub repository.
4. I-click ang **"Deploy"**.
5. Sa loob ng 10 segundo, magkakaroon ka na ng live website URL (hal. `https://globalpulse-explorer.vercel.app`) na may libreng SSL (HTTPS)!

---

### Paraan 2: Netlify (Drag & Drop — Walang Git na Kailangan) 📦

1. Mag-login sa [netlify.com](https://app.netlify.com).
2. Pumunta sa **"Sites"** tab.
3. I-drag and drop lamang ang buong `GlobalPulse` folder diretso sa Netlify browser drop zone.
4. Awtomatikong magiging live ang iyong website na may libreng URL (hal. `https://globalpulse.netlify.app`)!

---

### Paraan 3: GitHub Pages (Libre Direct sa GitHub) 🐙

1. Gumawa ng bagong repository sa iyong GitHub account (hal. `GlobalPulse`).
2. I-push ang mga files sa repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of GlobalPulse"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/GlobalPulse.git
   git push -u origin main
   ```
3. Sa GitHub repository, pumunta sa **Settings** > **Pages**.
4. Sa ilalim ng **"Branch"**, piliin ang `main` at folder `/(root)`, pagkatapos ay i-click ang **Save**.
5. Pagkatapos ng 1-2 minuto, live na ang website mo sa `https://YOUR_USERNAME.github.io/GlobalPulse/`!

---

## 🛠️ APIs & Libraries Used

| Technology | Purpose | Key / Tier |
|---|---|---|
| **REST Countries API v3.1** | Country encyclopedia, flags, population, languages, borders | 100% Libre / No key needed |
| **Nominatim (OpenStreetMap)** | Forward & reverse geocoding from addresses to coordinates | 100% Libre / Open-source |
| **HTTPS IP Geolocation** | Multi-fallback user city/country auto-detection (`ipwho.is`, `freeipapi.com`, `ipapi.co`) | 100% Libre |
| **Leaflet.js + CartoDB** | Interactive map canvas, custom sonar markers, flight paths | 100% Libre / Open-source |
| **Google Gemini API** (Optional) | AI conversational travel agent | Free tier available |

---

## 💻 Local Testing

Kung gusto mong subukan ito sa iyong local machine bago i-upload:

```bash
# Gamit ang npx serve:
npx -y serve .

# O gamit ang Python:
python -m http.server 3000
```
Buksan ang `http://localhost:3000` sa iyong browser.
