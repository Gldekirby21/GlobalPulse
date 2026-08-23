/**
 * Currency Converter — live exchange rates via open.er-api.com
 * Free, no API key. Rates cached for 24 hours per base currency.
 */

import { countriesService } from '../services/countriesService.js';

const CACHE_KEY = 'globalpulse_fx_rates';
const CACHE_TTL = 24 * 60 * 60 * 1000;

class CurrencyConverter {
    constructor() {
        this.container = null;
        this.rates = null; // { USD: 1, PHP: 58.2, ... }
    }

    init() {
        this.container = document.getElementById('currencyConverter');
        if (!this.container) return;

        this.render();
        this.loadRates().then(() => this.populateSelects());
    }

    render() {
        this.container.innerHTML = `
      <div class="fx-card">
        <div class="fx-header">
          <i class="fa-solid fa-money-bill-transfer"></i>
          <div>
            <h3>Currency Converter</h3>
            <p style="font-size:0.8rem; color:var(--text-muted);">Live mid-market rates</p>
          </div>
        </div>
        <div class="fx-row">
          <input type="number" id="fxAmount" value="100" min="0" step="any" class="fx-input" />
          <select id="fxFrom" class="custom-select fx-select"></select>
        </div>
        <button type="button" class="fx-swap-btn" id="fxSwapBtn" title="Swap currencies">
          <i class="fa-solid fa-arrow-down-up-across-line"></i>
        </button>
        <div class="fx-row">
          <input type="text" id="fxResult" class="fx-input" readonly placeholder="—" />
          <select id="fxTo" class="custom-select fx-select"></select>
        </div>
        <p class="fx-meta" id="fxMeta">Loading rates…</p>
      </div>
    `;

        document.getElementById('fxAmount')?.addEventListener('input', () => this.convert());
        document.getElementById('fxFrom')?.addEventListener('change', () => this.convert());
        document.getElementById('fxTo')?.addEventListener('change', () => this.convert());
        document.getElementById('fxSwapBtn')?.addEventListener('click', () => {
            const from = document.getElementById('fxFrom');
            const to = document.getElementById('fxTo');
            [from.value, to.value] = [to.value, from.value];
            this.convert();
        });
    }

    async loadRates() {
        // Try cache first
        try {
            const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            if (cached && Date.now() - cached.ts < CACHE_TTL) {
                this.rates = cached.rates;
                this._meta('Rates updated ' + new Date(cached.ts).toLocaleDateString());
                return;
            }
        } catch (e) { /* ignore corrupt cache */ }

        try {
            const res = await fetch('https://open.er-api.com/v6/latest/USD');
            if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
            const json = await res.json();
            if (json.result !== 'success' || !json.rates) throw new Error('Bad FX payload');

            this.rates = json.rates;
            localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rates: this.rates }));
            this._meta('Rates updated ' + new Date().toLocaleDateString());
        } catch (err) {
            console.warn('FX rates unavailable:', err.message);
            this._meta('Rates unavailable offline');
        }
    }

    /** Prefer currencies actually used by countries, then everything else. */
    populateSelects() {
        const from = document.getElementById('fxFrom');
        const to = document.getElementById('fxTo');
        if (!from || !to || !this.rates) return;

        const used = new Set();
        (countriesService.countries || []).forEach((c) => {
            Object.keys(c.currencies || {}).forEach((code) => {
                if (this.rates[code]) used.add(code);
            });
        });

        const codes = [...new Set([...used, ...Object.keys(this.rates)])].sort();

        from.innerHTML = codes.map((c) => `<option value="${c}">${c}</option>`).join('');
        to.innerHTML = from.innerHTML;
        from.value = this.rates.USD ? 'USD' : codes[0];
        to.value = this.rates.PHP ? 'PHP' : codes[1] || codes[0];

        this.convert();
    }

    convert() {
        const amountEl = document.getElementById('fxAmount');
        const from = document.getElementById('fxFrom');
        const to = document.getElementById('fxTo');
        const out = document.getElementById('fxResult');
        if (!amountEl || !from || !to || !out || !this.rates) return;

        const amount = parseFloat(amountEl.value);
        if (!Number.isFinite(amount)) { out.value = ''; return; }

        const rFrom = this.rates[from.value];
        const rTo = this.rates[to.value];
        if (!rFrom || !rTo) { out.value = '—'; return; }

        const converted = (amount / rFrom) * rTo;
        out.value = converted.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    _meta(text) {
        const el = document.getElementById('fxMeta');
        if (el) el.textContent = text;
    }
}

export const currencyConverter = new CurrencyConverter();
