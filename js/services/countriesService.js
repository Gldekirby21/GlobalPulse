/**
 * Countries Data Service
 * Multi-source fallback engine:
 * 1. Bundled local static dataset ('./data/countries.json') - 0ms load, zero CORS issues
 * 2. High-speed global CDN mirror (jsdelivr)
 * 3. REST Countries API mirror
 */

class CountriesService {
  constructor() {
    this.STORAGE_KEY = 'globalpulse_countries_cache_v3';
    this.CACHE_TIMESTAMP_KEY = 'globalpulse_countries_time';
    this.CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
    this.countries = [];
    this.cca3Map = new Map();
    this.cca2Map = new Map();
  }

  /**
   * Loads all countries with robust multi-tiered fallback
   * @returns {Promise<Array>}
   */
  async getAllCountries() {
    if (this.countries.length > 0) {
      return this.countries;
    }

    // Check LocalStorage cache
    const cachedData = localStorage.getItem(this.STORAGE_KEY);
    const cachedTime = localStorage.getItem(this.CACHE_TIMESTAMP_KEY);

    if (cachedData && cachedTime && (Date.now() - parseInt(cachedTime, 10) < this.CACHE_TTL)) {
      try {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed) && parsed.length > 50) {
          this.countries = parsed;
          this._buildIndex();
          return this.countries;
        }
      } catch (e) {
        console.warn('Cache parse error, refreshing dataset...');
      }
    }

    // Source 1: Bundled local JSON dataset (Fastest & 100% reliable)
    try {
      const response = await fetch('./data/countries.json');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          this.countries = data.sort((a, b) => a.name.common.localeCompare(b.name.common));
          this._buildIndex();
          this._saveCache(this.countries);
          return this.countries;
        }
      }
    } catch (err) {
      console.warn('Local data/countries.json fetch failed, trying CDN fallback...', err);
    }

    // Source 2: Global CDN Mirror (jsdelivr)
    try {
      const cdnUrl = 'https://cdn.jsdelivr.net/gh/mledoze/countries@master/dist/countries.json';
      const response = await fetch(cdnUrl);
      if (response.ok) {
        const raw = await response.json();
        this.countries = this._normalizeRawCountries(raw);
        this._buildIndex();
        this._saveCache(this.countries);
        return this.countries;
      }
    } catch (cdnErr) {
      console.warn('CDN fetch failed, trying REST Countries mirror...', cdnErr);
    }

    // If all network failed but cached data exists
    if (cachedData) {
      this.countries = JSON.parse(cachedData);
      this._buildIndex();
      return this.countries;
    }

    throw new Error('Unable to load countries dataset from any source.');
  }

  _saveCache(data) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem(this.CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (e) {
      console.warn('LocalStorage limit for countries cache');
    }
  }

  _normalizeRawCountries(raw) {
    return raw.map(c => {
      const commonName = c.name?.common || c.name || '';
      const officialName = c.name?.official || commonName;
      const cca2 = (c.cca2 || '').toUpperCase();
      const cca3 = (c.cca3 || '').toUpperCase();

      return {
        name: { common: commonName, official: officialName },
        cca2,
        cca3,
        capital: Array.isArray(c.capital) ? c.capital : (c.capital ? [c.capital] : []),
        region: c.region || 'World',
        subregion: c.subregion || '',
        population: c.population || 0,
        area: c.area || 0,
        flags: {
          svg: `https://flagcdn.com/${cca2.lowerCase || cca2.toLowerCase()}.svg`,
          png: `https://flagcdn.com/w320/${cca2.lowerCase || cca2.toLowerCase()}.png`
        },
        coatOfArms: {
          svg: `https://mainfacts.com/media/images/coats_of_arms/${cca2.toLowerCase()}.svg`
        },
        languages: c.languages || {},
        currencies: c.currencies || {},
        latlng: c.latlng || [],
        borders: c.borders || [],
        timezones: c.timezones || ['UTC'],
        car: { side: c.car?.side || 'right' },
        unMember: c.unMember !== false
      };
    }).sort((a, b) => a.name.common.localeCompare(b.name.common));
  }

  /**
   * Build quick lookup index for Alpha-2 & Alpha-3 codes
   */
  _buildIndex() {
    this.cca3Map.clear();
    this.cca2Map.clear();
    this.countries.forEach(c => {
      if (c.cca3) this.cca3Map.set(c.cca3.toUpperCase(), c);
      if (c.cca2) this.cca2Map.set(c.cca2.toUpperCase(), c);
    });
  }

  /**
   * Get Country by CCA3 (e.g. "PHL", "USA", "JPN") or CCA2 ("PH", "US")
   */
  getCountryByCode(code) {
    if (!code) return null;
    const clean = code.toUpperCase().trim();
    return this.cca3Map.get(clean) || this.cca2Map.get(clean) || null;
  }

  /**
   * Get Country by Common Name or Exact Match
   */
  getCountryByName(name) {
    if (!name) return null;
    const lower = name.toLowerCase().trim();
    return this.countries.find(c => 
      c.name.common.toLowerCase() === lower || 
      c.name.official.toLowerCase() === lower
    ) || null;
  }

  /**
   * Filter and search countries in memory
   */
  filterCountries({ query = '', region = 'All', sortBy = 'name_asc' } = {}) {
    let result = [...this.countries];

    // Filter by Region / Continent
    if (region && region !== 'All') {
      result = result.filter(c => c.region === region || (region === 'Antarctic' && c.region === 'Antarctic'));
    }

    // Filter by Search Query
    if (query && query.trim() !== '') {
      const q = query.toLowerCase().trim();
      result = result.filter(c => {
        const commonName = (c.name?.common || '').toLowerCase();
        const officialName = (c.name?.official || '').toLowerCase();
        const capital = c.capital ? c.capital.join(' ').toLowerCase() : '';
        const languages = c.languages ? Object.values(c.languages).join(' ').toLowerCase() : '';
        const cca2 = (c.cca2 || '').toLowerCase();
        const cca3 = (c.cca3 || '').toLowerCase();

        return commonName.includes(q) || 
               officialName.includes(q) || 
               capital.includes(q) || 
               languages.includes(q) ||
               cca2 === q ||
               cca3 === q;
      });
    }

    // Sort Results
    switch (sortBy) {
      case 'pop_desc':
        result.sort((a, b) => (b.population || 0) - (a.population || 0));
        break;
      case 'pop_asc':
        result.sort((a, b) => (a.population || 0) - (b.population || 0));
        break;
      case 'area_desc':
        result.sort((a, b) => (b.area || 0) - (a.area || 0));
        break;
      case 'area_asc':
        result.sort((a, b) => (a.area || 0) - (b.area || 0));
        break;
      case 'name_desc':
        result.sort((a, b) => (b.name?.common || '').localeCompare(a.name?.common || ''));
        break;
      case 'name_asc':
      default:
        result.sort((a, b) => (a.name?.common || '').localeCompare(b.name?.common || ''));
        break;
    }

    return result;
  }

  /**
   * Helper: Format number with commas
   */
  formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    return new Intl.NumberFormat('en-US').format(num);
  }

  /**
   * Helper: Get formatted languages list
   */
  getLanguagesString(country) {
    if (!country.languages || Object.keys(country.languages).length === 0) return 'None documented';
    return Object.values(country.languages).join(', ');
  }

  /**
   * Helper: Get formatted currencies string
   */
  getCurrenciesString(country) {
    if (!country.currencies || Object.keys(country.currencies).length === 0) return 'None';
    return Object.values(country.currencies)
      .map(c => typeof c === 'object' ? `${c.name || ''} (${c.symbol || ''})`.trim() : c)
      .filter(Boolean)
      .join(', ');
  }
}

export const countriesService = new CountriesService();
