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
