/**
 * IP Geolocation Service
 * Multi-fallback HTTPS provider engine to detect user location seamlessly:
 * 1. ipwho.is (HTTPS, fast, generous free tier)
 * 2. freeipapi.com (HTTPS, free)
 * 3. ipapi.co (HTTPS)
 * 4. HTML5 navigator.geolocation (Browser hardware coordinates fallback)
 */

class IPService {
  constructor() {
    this.cachedLocation = null;
    this.STORAGE_KEY = 'globalpulse_user_geo';
  }

  /**
   * Fetches the user's IP-based geolocation
   * @returns {Promise<{
   *   ip: string,
   *   city: string,
   *   region: string,
   *   country: string,
   *   countryCode: string,
   *   lat: number,
   *   lon: number,
   *   timezone: string,
   *   isp: string,
   *   currency: string,
   *   flag: string
   * }>}
   */
  /**
   * Validates & coerces raw provider coordinates into finite numbers.
   * Returns { lat, lon } or null when missing/invalid/out of range.
   */
  _sanitizeCoords(lat, lon) {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
    return { lat: la, lon: lo };
  }

  async detectLocation() {
    // Check cached session data (validate shape — stale cache from an older
    // schema may be missing usable lat/lon)
    const saved = sessionStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const coords = this._sanitizeCoords(parsed?.lat, parsed?.lon);
        if (coords) {
          parsed.lat = coords.lat;
          parsed.lon = coords.lon;
          this.cachedLocation = parsed;
          return this.cachedLocation;
        }
        sessionStorage.removeItem(this.STORAGE_KEY);
      } catch (e) {
        console.warn('Invalid cached geo data');
      }
    }

    let geoData = null;

    // Provider 1: ipwho.is
    try {
      const res = await fetch('https://ipwho.is/');
      if (res.ok) {
        const data = await res.json();
        const coords = this._sanitizeCoords(data.latitude, data.longitude);
        if (data.success !== false && coords) {
          geoData = {
            ip: data.ip || 'Unknown',
            city: data.city || 'Unknown City',
            region: data.region || '',
            country: data.country || 'Unknown Country',
            countryCode: data.country_code || 'PH',
            lat: coords.lat,
            lon: coords.lon,
            timezone: data.timezone?.id || 'UTC',
            isp: data.connection?.isp || data.connection?.org || 'Standard ISP',
            currency: data.currency?.code || (data.country_code === 'PH' ? 'PHP' : 'USD'),
            flag: data.flag?.img || `https://flagcdn.com/w80/${(data.country_code || 'ph').toLowerCase()}.png`
          };
        }
      }
    } catch (err) {
      console.warn('Provider 1 (ipwho.is) failed, trying Provider 2...', err);
    }

    // Provider 2: freeipapi.com
    if (!geoData) {
      try {
        const res = await fetch('https://freeipapi.com/api/json');
        if (res.ok) {
          const data = await res.json();
          const coords = this._sanitizeCoords(data.latitude, data.longitude);
          if (coords) {
            geoData = {
              ip: data.ipAddress || 'Unknown',
              city: data.cityName || 'Unknown City',
              region: data.regionName || '',
              country: data.countryName || 'Unknown Country',
              countryCode: data.countryCode || 'PH',
              lat: coords.lat,
              lon: coords.lon,
              timezone: data.timeZones?.[0] || 'UTC',
              isp: 'Broadband / Mobile Network',
              currency: data.currencies?.[0] || (data.countryCode === 'PH' ? 'PHP' : 'USD'),
              flag: `https://flagcdn.com/w80/${(data.countryCode || 'ph').toLowerCase()}.png`
            };
          }
        }
      } catch (err) {
        console.warn('Provider 2 (freeipapi.com) failed, trying Provider 3...', err);
      }
    }

    // Provider 3: ipapi.co
    if (!geoData) {
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
          const data = await res.json();
          const coords = this._sanitizeCoords(data.latitude, data.longitude);
          if (coords) {
            geoData = {
              ip: data.ip || 'Unknown',
              city: data.city || 'Unknown City',
              region: data.region || '',
              country: data.country_name || 'Unknown Country',
              countryCode: data.country_code || 'PH',
              lat: coords.lat,
              lon: coords.lon,
              timezone: data.timezone || 'UTC',
              isp: data.org || 'Internet Provider',
              currency: data.currency || (data.country_code === 'PH' ? 'PHP' : 'USD'),
              flag: `https://flagcdn.com/w80/${(data.country_code || 'ph').toLowerCase()}.png`
            };
          }
        }
      } catch (err) {
        console.warn('Provider 3 (ipapi.co) failed', err);
      }
    }

    // Fallback if all IP geolocation APIs fail (e.g. strict ad-blocker or offline)
    if (!geoData) {
      geoData = {
        ip: '127.0.0.1',
        city: 'Manila',
        region: 'Metro Manila',
        country: 'Philippines',
        countryCode: 'PH',
        lat: 14.5995,
        lon: 120.9842,
        timezone: 'Asia/Manila',
        isp: 'Local Provider',
        currency: 'PHP',
        flag: 'https://flagcdn.com/w80/ph.png'
      };
    }

    this.cachedLocation = geoData;
    sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(geoData));
    return geoData;
  }

  /**
   * Persist a refined location object (e.g. after a GPS upgrade) so
   * subsequent loads reuse the most accurate known position.
   */
  updateCachedLocation(geo) {
    const coords = this._sanitizeCoords(geo?.lat, geo?.lon);
    if (!coords) return;

    geo.lat = coords.lat;
    geo.lon = coords.lon;
    this.cachedLocation = geo;

    try {
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(geo));
    } catch (e) {
      /* storage unavailable — non-fatal */
    }
  }

  /**
   * Request browser precise GPS coordinates
   */
  async getBrowserGPS() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported by browser'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
        },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }
}

export const ipService = new IPService();
