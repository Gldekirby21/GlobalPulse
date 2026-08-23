/**
 * GlobalPulse - Main Application Controller
 * Bootstraps services, handles routing/tabs, theme switching, and global state.
 */

import { ipService } from './services/ipService.js';
import { countriesService } from './services/countriesService.js';
import { nominatimService } from './services/nominatimService.js';
import { supabaseService } from './services/supabaseService.js';
import { mapManager } from './components/mapManager.js';
import { countriesView } from './components/countriesView.js';
import { compareView } from './components/compareView.js';
import { distanceCalc } from './components/distanceCalc.js';
import { aiGuide } from './components/aiGuide.js';
import { favoritesManager } from './components/favorites.js';
import { authModal } from './components/authModal.js';
import { geoQuiz } from './components/geoQuiz.js';
import { passport } from './components/passport.js';
import { chatPanel } from './components/chatPanel.js';
import { weatherService } from './services/weatherService.js';
import { currencyConverter } from './components/currencyConverter.js';
import { profileManager } from './components/profileManager.js';
import { socialFeed } from './components/socialFeed.js';
import { pulseStories } from './components/pulseStories.js';
import { notificationCenter } from './components/notificationCenter.js';

class GlobalPulseApp {
  constructor() {
    this.userLocation = null;
    this.activeTab = 'explore';
  }

  async init() {
    window.globalPulseApp = this;
    console.log('🌍 Initializing GlobalPulse Web System...');

    // 1. Theme Setup
    this.setupTheme();

    // 2. Tab Navigation Setup
    this.setupTabs();
    this.restoreLastTab();

    // 3. Initialize Interactive Components & Auth
    authModal.init();
    countriesView.init();
    aiGuide.init();
    distanceCalc.init();
    socialFeed.init();
    pulseStories.init();
    notificationCenter.init();

    // 4. Setup Community Location Sharing with Supabase
    this.setupCommunitySharing();

    // Open shared explorer profile cards (?explorer=<id>)
    passport.checkShareLink();

    // Refresh own radar marker & composer avatar whenever the profile changes
    window.addEventListener('globalpulse:profileupdated', () => {
      const g = this.userLocation;
      if (g && mapManager.userMarker) {
        mapManager.setUserLocation(
          g.lat, g.lon,
          `Your Location: ${g.city}, ${g.country}`,
          supabaseService.profile?.avatar_url || null
        );
      }
      const compAvatar = document.getElementById('composerUserAvatar');
      if (compAvatar && supabaseService.profile?.avatar_url) {
        compAvatar.src = supabaseService.profile.avatar_url;
      }
    });

    // 4. Setup Map & Locate Callbacks
    countriesView.setOnLocate((lat, lon, name) => {
      this.switchTab('map');
      mapManager.setSearchLocation(lat, lon, name);
    });

    distanceCalc.setOnViewOnMap(() => {
      this.switchTab('map');
    });

    mapManager.setOnCountrySelect((country) => {
      countriesView.openDetailModal(country);
    });

    mapManager.setOnReverseGeocode((geoInfo) => {
      this.updateReverseGeocodeCard(geoInfo);
    });

    // 5. Setup Nominatim Search Bar in Map Tab
    this.setupNominatimSearch();

    // 6. Setup Search & Filters in Countries Tab
    this.setupCountryFilters();

    // 7. Setup Saved Places View & Listeners
    this.setupFavoritesView();

    // 8. Fetch Countries & Auto-Detect Location Asynchronously
    await this.loadInitialData();
  }

  /**
   * Theme Controller (Dark / Light mode)
   * Priority: user's explicit choice > OS preference > dark default.
   */
  setupTheme() {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const saved = localStorage.getItem('globalpulse_theme');
    const initial = (saved === 'light' || saved === 'dark')
      ? saved
      : (media.matches ? 'light' : 'dark');

    document.documentElement.setAttribute('data-theme', initial);
    this.updateThemeIcon(initial);
    this.updateThemeColorMeta(initial);

    // Follow OS-level theme changes live until the user chooses manually
    const onSystemChange = (e) => {
      if (localStorage.getItem('globalpulse_theme')) return;
      this.setTheme(e.matches ? 'light' : 'dark', { animate: true });
    };
    if (media.addEventListener) media.addEventListener('change', onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange); // older Safari

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        this.setTheme(next, { persist: true, animate: true });
      });
    }
  }

  /**
   * Apply a theme across the whole system: CSS variables, toggle icon,
   * browser chrome color, and basemap tiles — with smooth cross-fade.
   */
  setTheme(theme, { persist = false, animate = false } = {}) {
    const root = document.documentElement;

    if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('theme-anim');
      clearTimeout(this._themeAnimTimer);
      this._themeAnimTimer = setTimeout(() => root.classList.remove('theme-anim'), 450);
    }

    root.setAttribute('data-theme', theme);
    if (persist) localStorage.setItem('globalpulse_theme', theme);

    this.updateThemeIcon(theme);
    this.updateThemeColorMeta(theme);
    this.applyMapTheme(theme);
  }

  updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggleBtn i');
    if (icon) {
      icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
  }

  updateThemeColorMeta(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', theme === 'light' ? '#f1f5f9' : '#0a0f1d');
  }

  /**
   * Sync the Leaflet basemap + floating layer buttons with the theme
   */
  applyMapTheme(theme) {
    mapManager.applyTheme(theme);

    const themedKey = theme === 'light' ? 'dark' : 'cartoDark';
    document.querySelectorAll('.map-layer-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layer === themedKey);
    });
  }

  /**
   * Tab Navigation System
   */
  setupTabs() {
    const tabButtons = document.querySelectorAll('[data-tab]');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        this.switchTab(targetTab);
      });
    });

    // Browser back/forward support via URL hash
    window.addEventListener('hashchange', () => {
      const tab = location.hash.replace('#', '');
      if (tab && tab !== this.activeTab && document.getElementById(`view-${tab}`)) {
        this.switchTab(tab);
      }
    });
  }

  switchTab(tabId) {
    this.activeTab = tabId;

    // Remember position across reloads (localStorage + URL hash)
    try { localStorage.setItem('globalpulse_tab', tabId); } catch (e) { /* storage blocked */ }
    if (location.hash !== '#' + tabId) {
      history.replaceState(null, '', '#' + tabId);
    }

    // Update Nav Buttons (country page keeps the originating tab highlighted)
    if (tabId !== 'country') {
      document.querySelectorAll('[data-tab]').forEach(btn => {
        const isTarget = btn.dataset.tab === tabId;
        btn.classList.toggle('active', isTarget);
      });
    }

    // Update Sections
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active-view');
    });

    const targetSection = document.getElementById(`view-${tabId}`);
    if (targetSection) {
      targetSection.classList.add('active-view');
    }

    // Tab-specific lifecycle actions
    if (tabId === 'map') {
      mapManager.invalidateSize();
    } else if (tabId === 'compare') {
      compareView.init();
    } else if (tabId === 'saved') {
      this.renderFavoritesGrid();
    } else if (tabId === 'chat') {
      chatPanel.renderConversationList();
      chatPanel.renderRequests();
    }
  }

  /**
   * Load data on startup
   */
  async loadInitialData() {
    try {
      // 1. Fetch Countries
      await countriesService.getAllCountries();
      countriesView.render();
      compareView.init();
      distanceCalc.init();
      geoQuiz.init();
      currencyConverter.init();

      // 2. Detect User IP Geolocation
      this.detectUserLocation();

      // Re-assert restored tab in case any loader flipped sections
      this.restoreLastTab();
    } catch (err) {
      console.error('Error during initial load:', err);
    }
  }

  async detectUserLocation() {
    try {
      const geo = await ipService.detectLocation();

      // Defensive guard: never feed Leaflet non-numeric coordinates
      geo.lat = Number(geo?.lat);
      geo.lon = Number(geo?.lon);
      if (!Number.isFinite(geo.lat) || !Number.isFinite(geo.lon)) {
        throw new Error(`IP service returned invalid coordinates: (${geo.lat}, ${geo.lon})`);
      }

      this.userLocation = geo;
      console.log('📍 User location detected (IP estimate):', geo);

      this.renderLocationUI(geo);

      // Initialize Leaflet Map centered around user location
      mapManager.init('leafletMap', geo.lat, geo.lon);
      this.restoreMapLayer();
      mapManager.setUserLocation(geo.lat, geo.lon, `Your Location: ${geo.city}, ${geo.country}`,
        supabaseService.profile?.avatar_url || null);

      // IP geolocation only resolves to the ISP's registered area (often a
      // regional center), so refine with precise device GPS in the background
      this.refineWithGPS(geo);
    } catch (err) {
      console.warn('Geolocation detection failed:', err);
      mapManager.init('leafletMap', 14.5995, 120.9842);
      this.restoreMapLayer();
    }
  }

  /**
   * Render header geo chip + hero location card from a geo object
   */
  renderLocationUI(geo) {
    // Header Chip
    const geoChip = document.getElementById('userGeoChip');
    if (geoChip) {
      geoChip.innerHTML = `
        <span class="pulse-dot"></span>
        <span>${geo.city ? `${geo.city}, ` : ''}${geo.countryCode}</span>
      `;
      geoChip.onclick = () => {
        this.switchTab('map');
        mapManager.setUserLocation(geo.lat, geo.lon, `${geo.city}, ${geo.country}`,
          supabaseService.profile?.avatar_url || null);
      };
    }

    // Hero Live Location Card
    const heroCard = document.getElementById('heroLocationCard');
    if (!heroCard) return;

    const isGps = geo.source === 'gps';

    // Resolve country data to get authentic currency and official flag
    const countryData = countriesService.getCountryByCode(geo.countryCode) || countriesService.getCountryByName(geo.country);

    let displayCurrency = geo.currency;
    if (countryData && countryData.currencies) {
      displayCurrency = countriesService.getCurrenciesString(countryData);
    } else if (geo.countryCode === 'PH' || geo.country?.toLowerCase().includes('philippines')) {
      displayCurrency = 'Philippine peso (PHP)';
    }

    const flagSrc = countryData?.flags?.svg || countryData?.flags?.png || geo.flag;

    heroCard.innerHTML = `
      <div class="location-card-header">
        <span class="location-pill">
          <i class="fa-solid fa-${isGps ? 'satellite-dish' : 'circle-dot'}"></i>
          ${isGps ? 'Precise GPS Lock' : 'Live Pulse Detected'}
        </span>
        <img src="${flagSrc}" alt="${geo.country}" class="location-flag-large" />
      </div>
      <div class="location-info-main">
        <h3 class="location-city-country">${geo.city || 'Detected Region'}, ${geo.country}</h3>
        <span class="location-ip-badge">IP: ${geo.ip} &bull; ${geo.isp}${isGps ? ` &bull; GPS &plusmn;${geo.accuracy}m` : ''}</span>
        <div class="weather-chip" id="weatherChip">
          <i class="fa-solid fa-spinner fa-spin"></i> Weather…
        </div>
      </div>
      <div class="location-stats-grid">
        <div class="loc-stat-item">
          <span class="loc-stat-label">Coordinates</span>
          <span class="loc-stat-val">${geo.lat.toFixed(4)}&deg; N, ${geo.lon.toFixed(4)}&deg; E</span>
        </div>
        <div class="loc-stat-item">
          <span class="loc-stat-label">Local Currency</span>
          <span class="loc-stat-val">${displayCurrency}</span>
        </div>
        <div class="loc-stat-item">
          <span class="loc-stat-label">Timezone</span>
          <span class="loc-stat-val">${geo.timezone}</span>
        </div>
        <div class="loc-stat-item">
          <span class="loc-stat-label">Region</span>
          <span class="loc-stat-val">${geo.region || 'National'}</span>
        </div>
      </div>
      <button class="quick-view-my-country-btn" id="btnExploreMyCountry">
        <i class="fa-solid fa-compass"></i> Explore ${geo.country} Facts
      </button>
      ${!isGps ? `
        <button class="quick-view-my-country-btn" id="btnPreciseLocate"
          style="margin-top:0.5rem; background:transparent; border:1px solid var(--accent-cyan); color:var(--accent-cyan);">
          <i class="fa-solid fa-crosshairs"></i> Use My Precise GPS Location
        </button>
      ` : ''}
    `;

    const exploreBtn = document.getElementById('btnExploreMyCountry');
    if (exploreBtn) {
      exploreBtn.onclick = () => {
        const country = countriesService.getCountryByCode(geo.countryCode);
        if (country) countriesView.openDetailModal(country);
      };
    }

    const preciseBtn = document.getElementById('btnPreciseLocate');
    if (preciseBtn) {
      preciseBtn.onclick = () => this.refineWithGPS(geo, true);
    }

    // Live weather chip (Open-Meteo, no key needed)
    weatherService.getCurrent(geo.lat, geo.lon).then((w) => {
      const chip = document.getElementById('weatherChip');
      if (!chip) return;
      chip.innerHTML = w
        ? weatherService.chipHtml(w)
        : '<i class="fa-solid fa-cloud"></i> Weather unavailable';
    });
  }

  /**
   * Upgrade the IP-based location to precise device GPS coordinates.
   * Asks the browser for hardware coordinates (with user permission),
   * reverse-geocodes them for accurate city/region names, then re-renders
   * the UI and moves the map marker. Falls back silently to IP location.
   * @param {Object} geo - mutable geo object shared with this.userLocation
   * @param {boolean} manual - true when triggered by user button click
   */
  async refineWithGPS(geo, manual = false) {
    try {
      const gps = await ipService.getBrowserGPS();

      if (!Number.isFinite(gps.lat) || !Number.isFinite(gps.lon)) {
        throw new Error('GPS returned invalid coordinates');
      }

      const drifted = Math.abs(gps.lat - geo.lat) > 0.02 || Math.abs(gps.lon - geo.lon) > 0.02;

      geo.lat = gps.lat;
      geo.lon = gps.lon;
      geo.accuracy = Math.round(gps.accuracy);
      geo.source = 'gps';

      // Best-effort reverse geocode for accurate place labels
      try {
        const info = await nominatimService.reverseGeocode(geo.lat, geo.lon);
        if (info && info.displayName) {
          if (info.city) geo.city = info.city;
          if (info.state) geo.region = info.state;
          if (info.country) geo.country = info.country;
          if (info.countryCode) geo.countryCode = info.countryCode;
          geo.displayName = info.displayName;
        }
      } catch (_) {
        /* keep IP-derived labels */
      }

      ipService.updateCachedLocation(geo);
      this.userLocation = geo;
      console.log('🎯 Precise GPS location:', geo);

      this.renderLocationUI(geo);

      // Move the pulsing marker to the precise position
      if (mapManager.map) {
        mapManager.setUserLocation(geo.lat, geo.lon, `Your Location: ${geo.city}, ${geo.country}`,
          supabaseService.profile?.avatar_url || null);
      }
    } catch (_) {
      // Fallback seamlessly to accurate IP-based location without spamming console
    }
  }

  /**
   * Countries Tab Search & Filters
   */
  setupCountryFilters() {
    const searchInput = document.getElementById('countrySearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        countriesView.searchQuery = e.target.value;
        countriesView.render();
      });
    }

    const sortSelect = document.getElementById('countrySortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        countriesView.currentSort = e.target.value;
        countriesView.render();
      });
    }

    const regionPills = document.querySelectorAll('.region-pill-btn');
    regionPills.forEach(pill => {
      pill.addEventListener('click', () => {
        regionPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        countriesView.activeRegion = pill.dataset.region;
        countriesView.render();
      });
    });
  }

  /**
   * Nominatim Geocoding Search Box
   */
  setupNominatimSearch() {
    const input = document.getElementById('nominatimInput');
    const resultsList = document.getElementById('nominatimResults');

    if (!input || !resultsList) return;

    const debouncedSearch = nominatimService.debounce(async (val) => {
      if (!val || val.length < 2) {
        resultsList.innerHTML = '';
        return;
      }

      resultsList.innerHTML = `
        <div style="padding: 0.5rem; text-align: center; color: var(--text-muted); font-size: 0.82rem;">
          <i class="fa-solid fa-spinner fa-spin"></i> Searching Nominatim OpenStreetMap...
        </div>
      `;

      const results = await nominatimService.searchAddress(val);

      if (results.length === 0) {
        resultsList.innerHTML = `
          <div style="padding: 0.5rem; color: var(--text-muted); font-size: 0.82rem;">No address or landmark found.</div>
        `;
        return;
      }

      resultsList.innerHTML = results.map((item, idx) => `
        <div class="nominatim-result-item" data-idx="${idx}">
          <div class="nominatim-result-title">${item.name}</div>
          <div class="nominatim-result-coords">${item.displayName}</div>
        </div>
      `).join('');

      resultsList.querySelectorAll('.nominatim-result-item').forEach(itemElem => {
        itemElem.addEventListener('click', () => {
          const idx = parseInt(itemElem.dataset.idx, 10);
          const selected = results[idx];
          if (selected) {
            mapManager.setSearchLocation(
              selected.lat,
              selected.lon,
              selected.name,
              selected.displayName,
              selected.countryCode
            );
            this.updateReverseGeocodeCard(selected);
          }
        });
      });
    }, 350);

    input.addEventListener('input', (e) => debouncedSearch(e.target.value));

    // Map layer buttons
    document.querySelectorAll('.map-layer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.map-layer-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        mapManager.setLayer(btn.dataset.layer);
        try { localStorage.setItem('globalpulse_maplayer', btn.dataset.layer); } catch (e) { /* blocked */ }
      });
    });
  }

  /**
   * Session persistence — bring the user back exactly where they left off:
   * last active tab, chosen basemap, etc. survive browser refreshes.
   */
  restoreLastTab() {
    let last = null;
    try { last = localStorage.getItem('globalpulse_tab'); } catch (e) { /* blocked */ }
    // Never auto-restore the country detail page — it needs a selected country
    if (last && last !== 'explore' && last !== 'country' && document.getElementById(`view-${last}`)) {
      this.switchTab(last);
    }
  }

  restoreMapLayer() {
    let saved = null;
    try { saved = localStorage.getItem('globalpulse_maplayer'); } catch (e) { /* blocked */ }
    if (!saved) return;

    const btn = document.querySelector(`.map-layer-btn[data-layer="${saved}"]`);
    if (!btn) return;

    document.querySelectorAll('.map-layer-btn').forEach(b =>
      b.classList.toggle('active', b === btn)
    );
    mapManager.setLayer(saved);
  }

  updateReverseGeocodeCard(info) {
    const card = document.getElementById('reverseGeoInfoCard');
    if (!card || !info) return;

    card.innerHTML = `
      <div class="reverse-geo-header"><i class="fa-solid fa-location-dot"></i> Selected Spot</div>
      <div class="reverse-geo-address">${info.displayName || info.name || 'Map Coordinate'}</div>
      <div style="font-size: 0.78rem; color: var(--text-muted); font-family: monospace; margin-bottom: 0.5rem;">
        Lat: ${info.lat.toFixed(5)}, Lon: ${info.lon.toFixed(5)}
      </div>
      ${info.countryCode ? `
        <button class="quick-view-my-country-btn" id="btnReverseOpenCountry" style="margin-top: 0.5rem;">
          <i class="fa-solid fa-globe"></i> View Country Profile
        </button>
      ` : ''}
    `;

    const btn = document.getElementById('btnReverseOpenCountry');
    if (btn && info.countryCode) {
      btn.onclick = () => {
        const country = countriesService.getCountryByCode(info.countryCode);
        if (country) countriesView.openDetailModal(country);
      };
    }
  }

  /**
   * Favorites / Saved Bucket List View
   */
  setupFavoritesView() {
    window.addEventListener('favoritesUpdated', () => {
      if (this.activeTab === 'saved') {
        this.renderFavoritesGrid();
      }
    });

    const exportBtn = document.getElementById('btnExportFavorites');
    if (exportBtn) {
      exportBtn.onclick = () => favoritesManager.exportJSON();
    }
  }

  renderFavoritesGrid() {
    const container = document.getElementById('favoritesGrid');
    const exportBtn = document.getElementById('btnExportFavorites');
    if (!container) return;

    // Check if user is logged in
    if (!supabaseService.user) {
      if (exportBtn) exportBtn.style.display = 'none';
      container.innerHTML = `
        <div class="favorites-empty-state" style="grid-column: 1/-1; border-color: rgba(244, 63, 94, 0.3); background: rgba(244, 63, 94, 0.04); padding: 3.5rem 1.5rem;">
          <div class="favorites-empty-icon" style="color: var(--accent-rose); background: rgba(244, 63, 94, 0.12); width: 68px; height: 68px; font-size: 1.75rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
            <i class="fa-solid fa-lock"></i>
          </div>
          <h3 style="font-size: 1.3rem; margin-bottom: 0.4rem;">Travel Bucket List is Locked</h3>
          <p style="color: var(--text-muted); font-size: 0.92rem; max-width: 440px; margin: 0 auto 1.5rem; line-height: 1.5;">
            Please sign in to your GlobalPulse account to save your favorite countries and view your personal travel bucket list.
          </p>
          <button class="auth-submit-btn" id="btnUnlockSaved" style="width: auto; padding: 0.7rem 2rem; margin: 0 auto; font-size: 0.92rem; cursor: pointer;">
            <i class="fa-solid fa-right-to-bracket"></i> Sign In to Access
          </button>
        </div>
      `;

      document.getElementById('btnUnlockSaved')?.addEventListener('click', () => {
        authModal.open('signin');
      });
      return;
    }

    if (exportBtn) exportBtn.style.display = 'inline-flex';
    const favorites = favoritesManager.getFavorites();

    if (favorites.length === 0) {
      container.innerHTML = `
        <div class="favorites-empty-state" style="grid-column: 1/-1;">
          <div class="favorites-empty-icon"><i class="fa-regular fa-heart"></i></div>
          <h3>Your Travel Bucket List is Empty</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.4rem;">
            Click the heart icon on any country card to save your dream destinations here!
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = favorites.map(fav => {
      const country = countriesService.getCountryByCode(fav.id);
      const flag = fav.flag || country?.flags?.svg || '';

      return `
        <div class="country-card" data-cca3="${fav.id}">
          <div class="country-card-flag-wrap">
            <img src="${flag}" alt="${fav.name}" class="country-card-flag" />
            <span class="country-card-region-badge">${fav.region || 'Saved'}</span>
          </div>
          <div class="country-card-body">
            <h3 class="country-card-title">${fav.name}</h3>
            <p class="country-card-native">Capital: ${fav.capital || 'N/A'}</p>
          </div>
          <div class="country-card-footer">
            <span>Explore Facts <i class="fa-solid fa-arrow-right"></i></span>
            <button class="favorite-btn-card active" data-cca3="${fav.id}" title="Remove from bucket list" onclick="event.stopPropagation();">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.country-card').forEach(card => {
      card.addEventListener('click', () => {
        const cca3 = card.dataset.cca3;
        const country = countriesService.getCountryByCode(cca3);
        if (country) countriesView.openDetailModal(country);
      });
    });

    container.querySelectorAll('.favorite-btn-card').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cca3 = btn.dataset.cca3;
        favoritesManager.removeFavorite(cca3);
        this.renderFavoritesGrid();
        countriesView.render();
      });
    });
  }

  /**
   * Supabase Community Location Sharing
   */
  setupCommunitySharing() {
    // Provide location coordinates to Supabase service
    supabaseService.setCoordsProvider(() => {
      if (!this.userLocation) return null;
      return {
        lat: this.userLocation.lat,
        lon: this.userLocation.lon,
        city: this.userLocation.city,
        country: this.userLocation.country,
        countryCode: this.userLocation.countryCode
      };
    });

    // Wire Community Panel Toggle button
    const toggleBtn = document.getElementById('communityToggleBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (!supabaseService.user) {
          authModal.open('signin');
          return;
        }
        const task = supabaseService.sharingEnabled ? supabaseService.stopSharing() : supabaseService.startSharing();
        task.then(() => {
          authModal.renderAuthArea({ user: supabaseService.user, profile: supabaseService.profile });
        });
      });
    }

    // Consolidated Auth Change Handler
    const handleAuthChange = (session) => {
      authModal.renderAuthArea(session);
      chatPanel.setSession(session);
      geoQuiz.setSession(session);
      socialFeed.loadPosts();
      pulseStories.loadStories();
      notificationCenter.loadNotifications();
      this.renderFavoritesGrid();
      countriesView.render();
      if (session) {
        passport.refresh();
        supabaseService.publishLocation();
        supabaseService.startHeartbeat();
      } else {
        passport.stampedSet.clear();
        supabaseService.stopHeartbeat();
      }
    };

    authModal.onAuthStateChanged = handleAuthChange;

    authModal.onSharingChanged = () => {
      if (supabaseService.user && supabaseService.sharingEnabled) {
        supabaseService.publishLocation(true);
      }
    };

    // Initialize Supabase session with consolidated callback
    supabaseService.init(handleAuthChange);

    // Chat / Friends drawer
    chatPanel.init();

    // Realtime Community Location Stream
    supabaseService.subscribeToLocations((users) => {
      this.renderCommunityPanel(users);
      document.dispatchEvent(new CustomEvent('globalpulse:communityfeed', { detail: { users } }));
      mapManager.updateCommunityMarkers(users, supabaseService.user?.id, this.userLocation, {
        teaser: !isAuthenticated()
      });
    });
  }

  renderCommunityPanel(users) {
    const countElem = document.getElementById('communityCount');
    const listElem = document.getElementById('communityList');

    if (!listElem) return;

    const authed = isAuthenticated();
    const friendIds = new Set(chatPanel.getFriendIds());
    let list = (users || []).filter(u => u.user_id !== supabaseService.user?.id);

    // Friends tab filter
    if (authed && chatPanel.communityTab === 'friends') {
      list = list.filter(u => friendIds.has(u.user_id));
    }

    if (countElem) countElem.textContent = String(list.length);

    // Guests: curiosity-driving teaser, no personal data
    if (!authed) {
      listElem.innerHTML = list.length
        ? `
          <p class="community-empty">
            <i class="fa-solid fa-eye"></i> ${list.length} explorer${list.length === 1 ? '' : 's'} online right now.
            <button type="button" class="link-btn" data-open-auth>Sign in</button> to connect!
          </p>`
        : `<p class="community-empty">Sign in to share your pulse and see explorers on the map.</p>`;
      bindAuthTriggers(listElem);
      return;
    }

    if (list.length === 0) {
      listElem.innerHTML = `
        <p class="community-empty">
          ${chatPanel.communityTab === 'friends'
          ? 'No friends online right now — add explorers from the map!'
          : 'No other explorers online right now. You are the pioneer!'}
        </p>`;
      return;
    }

    listElem.innerHTML = list.map(u => {
      const name = u.profiles?.username || 'Explorer';
      const color = u.profiles?.avatar_color || '#06b6d4';
      const initial = name.charAt(0).toUpperCase();
      const place = [u.city, u.country].filter(Boolean).join(', ') || 'Global';
      const isFriend = friendIds.has(u.user_id);

      return `
        <div class="community-user-item" data-lat="${u.lat}" data-lon="${u.lon}" data-name="${name}">
          <span class="avatar-dot" style="--avatar:${color}; width:24px; height:24px; font-size:0.75rem;">${initial}</span>
          <div style="flex:1; overflow:hidden;">
            <div style="font-weight:700; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
            <div style="font-size:0.72rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${place}</div>
          </div>
          <button class="community-action-btn" data-chat-user="${u.user_id}" title="Message ${name}">
            <i class="fa-solid fa-comment-dots"></i>
          </button>
          ${!isFriend ? `
            <button class="community-action-btn" data-addfriend-user="${u.user_id}" title="Add friend">
              <i class="fa-solid fa-user-plus"></i>
            </button>` : ''}
          <i class="fa-solid fa-location-arrow community-fly-btn" style="font-size:0.75rem; color:var(--accent-cyan);"></i>
        </div>
      `;
    }).join('');

    listElem.querySelectorAll('.community-user-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('[data-chat-user], [data-addfriend-user]')) return;
        const lat = parseFloat(item.dataset.lat);
        const lon = parseFloat(item.dataset.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          this.switchTab('map');
          mapManager._flyToSafe([lat, lon], 7, 1.5);
        }
      });
    });
  }

}

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new GlobalPulseApp();
  app.init();

  // PWA service worker (HTTPS / localhost only)
  if ('serviceWorker' in navigator && ['https:', 'localhost'].includes(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch((err) =>
      console.info('Service worker not registered:', err.message)
    );
  }
});
