/**
 * Weather Service — Open-Meteo current conditions
 * Free API, no key required. Results cached 30 minutes per location.
 */

const WMO_CODES = {
    0: { icon: 'fa-sun', label: 'Clear Sky' },
    1: { icon: 'fa-cloud-sun', label: 'Mostly Clear' },
    2: { icon: 'fa-cloud-sun', label: 'Partly Cloudy' },
    3: { icon: 'fa-cloud', label: 'Overcast' },
    45: { icon: 'fa-smog', label: 'Fog' },
    48: { icon: 'fa-smog', label: 'Freezing Fog' },
    51: { icon: 'fa-cloud-rain', label: 'Light Drizzle' },
    53: { icon: 'fa-cloud-rain', label: 'Drizzle' },
    55: { icon: 'fa-cloud-rain', label: 'Heavy Drizzle' },
    61: { icon: 'fa-cloud-rain', label: 'Light Rain' },
    63: { icon: 'fa-cloud-showers-heavy', label: 'Rain' },
    65: { icon: 'fa-cloud-showers-heavy', label: 'Heavy Rain' },
    66: { icon: 'fa-cloud-rain', label: 'Freezing Rain' },
    67: { icon: 'fa-cloud-showers-heavy', label: 'Freezing Rain' },
    71: { icon: 'fa-snowflake', label: 'Light Snow' },
    73: { icon: 'fa-snowflake', label: 'Snow' },
    75: { icon: 'fa-snowflake', label: 'Heavy Snow' },
    77: { icon: 'fa-snowflake', label: 'Snow Grains' },
    80: { icon: 'fa-cloud-showers-heavy', label: 'Light Showers' },
    81: { icon: 'fa-cloud-showers-heavy', label: 'Showers' },
    82: { icon: 'fa-cloud-showers-heavy', label: 'Violent Showers' },
    85: { icon: 'fa-snowflake', label: 'Snow Showers' },
    86: { icon: 'fa-snowflake', label: 'Snow Showers' },
    95: { icon: 'fa-cloud-bolt', label: 'Thunderstorm' },
    96: { icon: 'fa-cloud-bolt', label: 'Thunderstorm + Hail' },
    99: { icon: 'fa-cloud-bolt', label: 'Severe Thunderstorm' }
};

class WeatherService {
    constructor() {
        this.cache = new Map();
        this.TTL = 30 * 60 * 1000; // 30 minutes
    }

    /**
     * Current weather for coordinates.
     * @returns {{tempC:number, windspeed:number, icon:string, label:string}|null}
     */
    async getCurrent(lat, lon) {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
        const hit = this.cache.get(key);
        if (hit && Date.now() - hit.ts < this.TTL) return hit.data;

        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);

            const json = await res.json();
            const cw = json.current_weather;
            if (!cw) return null;

            const meta = WMO_CODES[cw.weathercode] || { icon: 'fa-cloud', label: 'Unknown' };
            const data = {
                tempC: Math.round(cw.temperature),
                windspeed: Math.round(cw.windspeed),
                icon: meta.icon,
                label: meta.label
            };

            this.cache.set(key, { ts: Date.now(), data });
            return data;
        } catch (err) {
            console.warn('Weather fetch failed:', err.message);
            return null;
        }
    }

    /** Render helper — returns the chip's inner HTML for a weather object. */
    chipHtml(w) {
        if (!w) return '';
        return `<i class="fa-solid ${w.icon}" title="${w.label}"></i> ${w.tempC}&deg;C`;
    }
}

export const weatherService = new WeatherService();
