/**
 * Leaflet Map & Layer Manager
 * Handles interactive map, custom radar pulse markers, layer switching,
 * click-to-reverse-geocode, and flight arc polylines.
 */

import { nominatimService } from '../services/nominatimService.js';
import { countriesService } from '../services/countriesService.js';
import { favoritesManager } from './favorites.js';

class MapManager {
  constructor() {
    this.map = null;
    this.userMarker = null;
    this.searchMarker = null;
    this.flightPathLine = null;
    this.activeLayer = 'dark';
    this.tileLayers = {};
    this.onCountrySelectCallback = null;
    this.onReverseGeocodeCallback = null;
  }

  /**
   * Initializes Leaflet Map in container
   * @param {string} containerId 
   * @param {number} defaultLat 
   * @param {number} defaultLon 
   */
  init(containerId = 'leafletMap', defaultLat = 14.5995, defaultLon = 120.9842) {
    if (this.map) return;

    // Tile Layers
    this.tileLayers = {
      dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }),
      cartoDark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO, &copy; OpenStreetMap',
        subdomains: 'abcd',
        maxZoom: 19
      }),
      osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      })
    };

    // Initialize Map — pick the basemap matching the active app theme
    const prefersLight = document.documentElement.getAttribute('data-theme') === 'light';
    this.map = L.map(containerId, {
      center: [defaultLat, defaultLon],
      zoom: 5,
      layers: [this.tileLayers[prefersLight ? 'dark' : 'cartoDark']],
      zoomControl: false
    });

    // Add Zoom Control top-left
    L.control.zoom({ position: 'topleft' }).addTo(this.map);

    // Map Click -> Reverse Geocoding
    this.map.on('click', async (e) => {
      const { lat, lng } = e.latlng;
      this.handleMapClick(lat, lng);
    });

    // Invalidate map size after render
    setTimeout(() => {
      this.map.invalidateSize();
    }, 400);
  }

  /**
   * Sets callback when a country details button in popup is clicked
   */
  setOnCountrySelect(callback) {
    this.onCountrySelectCallback = callback;
  }

  setOnReverseGeocode(callback) {
    this.onReverseGeocodeCallback = callback;
  }

  /**
   * Switch Active Tile Layer
   * @param {'dark' | 'cartoDark' | 'osm'} layerKey 
   */
  setLayer(layerKey) {
    if (!this.map || !this.tileLayers[layerKey]) return;

    Object.values(this.tileLayers).forEach(layer => this.map.removeLayer(layer));
    this.tileLayers[layerKey].addTo(this.map);
    this.activeLayer = layerKey;
  }

  /**
   * Auto-switch the basemap to match the app theme.
   * 'osm' is neutral and preserved if the user picked it manually.
   * @param {'light' | 'dark'} theme
   */
  applyTheme(theme) {
    if (!this.map) return;
    if (this.activeLayer === 'osm') return;

    const themedKey = theme === 'light' ? 'dark' : 'cartoDark';
    if (this.activeLayer !== themedKey) {
      this.setLayer(themedKey);
    }
  }

  /**
   * Place or update User Location pulsing marker
   */
  setUserLocation(lat, lon, label = 'Your Detected Location') {
    if (!this.map) return;

    lat = Number(lat);
    lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      console.warn('setUserLocation skipped: invalid coordinates', { lat, lon });
      return;
    }

    const pulseIcon = L.divIcon({
      className: 'custom-leaflet-div',
      html: `
        <div class="pulse-user-marker" title="${label}">
          <div class="sonar-wave"></div>
          <div class="core-dot"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    if (this.userMarker) {
      this.userMarker.setLatLng([lat, lon]);
    } else {
      this.userMarker = L.marker([lat, lon], { icon: pulseIcon }).addTo(this.map);
    }

    this.userMarker.bindPopup(`
      <div class="map-popup-card">
        <span class="map-popup-badge"><i class="fa-solid fa-location-crosshairs"></i> Current Pulse</span>
        <div class="map-popup-title">${label}</div>
        <div class="map-popup-address">Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}</div>
      </div>
    `);

    this._flyToSafe([lat, lon], 6, 1.5);
  }

  /**
   * Safely animate the map to a target location.
   * Leaflet's flyTo() produces NaN coordinates when the map container is
   * hidden / zero-sized (e.g. the map tab is not active), throwing
   * "Invalid LatLng object: (NaN, NaN)" on every animation frame.
   * We re-measure the container first and fall back to setView() when hidden.
   */
  _flyToSafe(latlng, zoom, duration = 1.5) {
    if (!this.map) return;

    // Synchronously re-measure in case the container just became visible
    this.map.invalidateSize();
    const size = this.map.getSize();

    if (!size.x || !size.y) {
      // Container is hidden — jump without animation (flyTo math would yield NaN)
      this.map.setView(latlng, zoom, { animate: false });
      return;
    }

    try {
      this.map.flyTo(latlng, zoom, { duration });
    } catch (err) {
      console.warn('flyTo failed, falling back to setView:', err);
      this.map.setView(latlng, zoom, { animate: false });
    }
  }

  /**
   * Place Geocoded Search Pin
   */
  setSearchLocation(lat, lon, title, addressText = '', countryCode = '') {
    if (!this.map) return;

    lat = Number(lat);
    lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      console.warn('setSearchLocation skipped: invalid coordinates', { lat, lon });
      return;
    }

    const pinIcon = L.divIcon({
      className: 'custom-leaflet-div',
      html: `
        <div class="custom-pin-marker">
          <i class="fa-solid fa-location-dot"></i>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -30]
    });

    if (this.searchMarker) {
      this.map.removeLayer(this.searchMarker);
    }

    this.searchMarker = L.marker([lat, lon], { icon: pinIcon }).addTo(this.map);

    const popupHtml = `
      <div class="map-popup-card">
        <span class="map-popup-badge"><i class="fa-solid fa-map-pin"></i> Found Location</span>
        <div class="map-popup-title">${title}</div>
        <div class="map-popup-address">${addressText || `Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`}</div>
        ${countryCode ? `
          <a class="map-popup-action-btn" data-country-code="${countryCode}" id="btn-popup-country-${countryCode}">
            <i class="fa-solid fa-circle-info"></i> View Country Encyclopedia
          </a>
        ` : ''}
      </div>
    `;

    this.searchMarker.bindPopup(popupHtml).openPopup();

    setTimeout(() => {
      const btn = document.getElementById(`btn-popup-country-${countryCode}`);
      if (btn && this.onCountrySelectCallback) {
        btn.onclick = () => {
          const country = countriesService.getCountryByCode(countryCode);
          if (country) this.onCountrySelectCallback(country);
        };
      }
    }, 100);

    this._flyToSafe([lat, lon], 12, 1.8);
  }

  /**
   * Handle on-map click to reverse geocode
   */
  async handleMapClick(lat, lng) {
    const loadingPopup = L.popup()
      .setLatLng([lat, lng])
      .setContent(`
        <div class="map-popup-card" style="text-align:center; padding: 0.75rem;">
          <i class="fa-solid fa-spinner fa-spin" style="color:var(--accent-cyan); font-size:1.4rem;"></i>
          <p style="margin-top:0.4rem; font-size:0.8rem; color:#94a3b8;">Identifying location coordinates...</p>
        </div>
      `)
      .openOn(this.map);

    const geoInfo = await nominatimService.reverseGeocode(lat, lng);

    if (this.onReverseGeocodeCallback) {
      this.onReverseGeocodeCallback(geoInfo || { lat, lon: lng, displayName: 'Selected Coordinates' });
    }

    const title = geoInfo?.name || geoInfo?.city || geoInfo?.country || 'Map Pin';
    const address = geoInfo?.displayName || `Lat: ${lat.toFixed(4)}, Lon: ${lng.toFixed(4)}`;
    const cCode = geoInfo?.countryCode || '';

    loadingPopup.setContent(`
      <div class="map-popup-card">
        <span class="map-popup-badge"><i class="fa-solid fa-compass"></i> Reverse Geocode</span>
        <div class="map-popup-title">${title}</div>
        <div class="map-popup-address">${address}</div>
        <div style="font-size:0.75rem; color:#64748b; margin-bottom:0.6rem; font-family:monospace;">
          ${lat.toFixed(5)}, ${lng.toFixed(5)}
        </div>
        ${cCode ? `
          <a class="map-popup-action-btn" id="btn-popup-reverse-${cCode}">
            <i class="fa-solid fa-globe"></i> Explore ${geoInfo.country || 'Country'}
          </a>
        ` : ''}
      </div>
    `);

    if (cCode) {
      setTimeout(() => {
        const btn = document.getElementById(`btn-popup-reverse-${cCode}`);
        if (btn && this.onCountrySelectCallback) {
          btn.onclick = () => {
            const country = countriesService.getCountryByCode(cCode);
            if (country) this.onCountrySelectCallback(country);
          };
        }
      }, 100);
    }
  }

  /**
   * Draw Great-Circle Animated Flight Path between two points
   */
  drawFlightPath(lat1, lon1, lat2, lon2, label1 = 'Point A', label2 = 'Point B') {
    if (!this.map) return;

    if (this.flightPathLine) {
      this.map.removeLayer(this.flightPathLine);
    }

    // Generate curve intermediate points (Great Circle approximation)
    const points = this._interpolateGreatCircle([lat1, lon1], [lat2, lon2], 50);

    this.flightPathLine = L.polyline(points, {
      color: '#06b6d4',
      weight: 3.5,
      opacity: 0.85,
      dashArray: '8, 8',
      lineCap: 'round'
    }).addTo(this.map);

    // Fit map bounds to show whole path with padding
    const bounds = L.latLngBounds([[lat1, lon1], [lat2, lon2]]);
    this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 10, animate: true });
  }

  _interpolateGreatCircle(p1, p2, numPoints = 50) {
    const lat1 = (p1[0] * Math.PI) / 180;
    const lon1 = (p1[1] * Math.PI) / 180;
    const lat2 = (p2[0] * Math.PI) / 180;
    const lon2 = (p2[1] * Math.PI) / 180;

    const d = 2 * Math.asin(Math.sqrt(
      Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon1 - lon2) / 2), 2)
    ));

    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const f = i / numPoints;
      const A = Math.sin((1 - f) * d) / Math.sin(d);
      const B = Math.sin(f * d) / Math.sin(d);

      const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
      const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
      const z = A * Math.sin(lat1) + B * Math.sin(lat2);

      const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
      const lon = Math.atan2(y, x);

      points.push([(lat * 180) / Math.PI, (lon * 180) / Math.PI]);
    }
    return points;
  }

  invalidateSize() {
    if (this.map) {
      setTimeout(() => this.map.invalidateSize(), 200);
    }
  }
}

export const mapManager = new MapManager();
