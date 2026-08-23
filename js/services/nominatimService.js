/**
 * Nominatim (OpenStreetMap) Geocoding Service
 * Provides free Forward (Address -> Coordinates) and Reverse (Coordinates -> Address) Geocoding.
 */

class NominatimService {
  constructor() {
    this.BASE_URL = 'https://nominatim.openstreetmap.org';
    this.USER_AGENT = 'GlobalPulse-Explorer/1.0 (web-system-edu)';
  }

  /**
   * Search an address, city, landmark, or street
   * @param {string} query 
   * @returns {Promise<Array>}
   */
  async searchAddress(query) {
    if (!query || query.trim().length < 2) return [];

    const url = `${this.BASE_URL}/search?q=${encodeURIComponent(query.trim())}&format=json&addressdetails=1&limit=8`;

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          // Custom header identifier for OpenStreetMap fair usage policy
          'User-Agent': this.USER_AGENT
        }
      });

      if (!response.ok) {
        throw new Error(`Nominatim error: ${response.status}`);
      }

      const results = await response.json();
      return results.map(item => ({
        displayName: item.display_name,
        name: item.name || item.display_name.split(',')[0],
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        type: item.type,
        category: item.class,
        importance: item.importance,
        address: item.address || {},
        country: item.address?.country || '',
        countryCode: (item.address?.country_code || '').toUpperCase(),
        city: item.address?.city || item.address?.town || item.address?.village || item.address?.state || ''
      }));
    } catch (err) {
      console.error('Nominatim search failed:', err);
      return [];
    }
  }

  /**
   * Reverse Geocode: Get address and details from latitude & longitude
   * @param {number} lat 
   * @param {number} lon 
   * @returns {Promise<Object>}
   */
  async reverseGeocode(lat, lon) {
    if (lat === undefined || lon === undefined) return null;

    const url = `${this.BASE_URL}/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`;

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': this.USER_AGENT
        }
      });

      if (!response.ok) {
        throw new Error(`Nominatim reverse error: ${response.status}`);
      }

      const item = await response.json();
      if (item.error) {
        return {
          displayName: 'Ocean / Uninhabited Area',
          lat,
          lon,
          country: 'International Waters / Wilderness',
          countryCode: ''
        };
      }

      return {
        displayName: item.display_name,
        name: item.name || item.display_name.split(',')[0],
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        address: item.address || {},
        road: item.address?.road || '',
        suburb: item.address?.suburb || item.address?.neighbourhood || '',
        city: item.address?.city || item.address?.town || item.address?.municipality || item.address?.village || '',
        state: item.address?.state || item.address?.province || '',
        postcode: item.address?.postcode || '',
        country: item.address?.country || '',
        countryCode: (item.address?.country_code || '').toUpperCase()
      };
    } catch (err) {
      console.error('Nominatim reverse geocode failed:', err);
      return null;
    }
  }

  /**
   * Utility debounce helper
   */
  debounce(func, wait = 300) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
}

export const nominatimService = new NominatimService();
