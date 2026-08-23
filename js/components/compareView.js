/**
 * Country vs Country Comparison Component
 * Visual metrics, population/area bar charts, side-by-side specs.
 */

import { countriesService } from '../services/countriesService.js';

class CompareView {
  constructor() {
    this.selectA = null;
    this.selectB = null;
    this.container = null;
    this.countryA = null;
    this.countryB = null;
  }

  init(selectAId = 'compareSelectA', selectBId = 'compareSelectB', containerId = 'compareGridContainer') {
    this.selectA = document.getElementById(selectAId);
    this.selectB = document.getElementById(selectBId);
    this.container = document.getElementById(containerId);

    if (this.selectA && this.selectB) {
      this.populateSelects();

      this.selectA.addEventListener('change', () => {
        this.countryA = countriesService.getCountryByCode(this.selectA.value);
        this.render();
      });

      this.selectB.addEventListener('change', () => {
        this.countryB = countriesService.getCountryByCode(this.selectB.value);
        this.render();
      });
    }
  }

  populateSelects() {
    const countries = countriesService.filterCountries();
    const optionsHtml = countries.map(c => `<option value="${c.cca3}">${c.name.common}</option>`).join('');

    if (this.selectA) {
      this.selectA.innerHTML = '<option value="">Select First Country...</option>' + optionsHtml;
      // Default to Philippines if available
      const ph = countries.find(c => c.cca3 === 'PHL' || c.name.common === 'Philippines');
      if (ph) {
        this.selectA.value = ph.cca3;
        this.countryA = ph;
      }
    }

    if (this.selectB) {
      this.selectB.innerHTML = '<option value="">Select Second Country...</option>' + optionsHtml;
      // Default to Japan if available
      const jp = countries.find(c => c.cca3 === 'JPN' || c.name.common === 'Japan');
      if (jp) {
        this.selectB.value = jp.cca3;
        this.countryB = jp;
      }
    }

    this.render();
  }

  setCountries(codeA, codeB) {
    if (this.selectA && codeA) {
      this.selectA.value = codeA;
      this.countryA = countriesService.getCountryByCode(codeA);
    }
    if (this.selectB && codeB) {
      this.selectB.value = codeB;
      this.countryB = countriesService.getCountryByCode(codeB);
    }
    this.render();
  }

  render() {
    if (!this.container) return;

    if (!this.countryA || !this.countryB) {
      this.container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
          <p>Please select both countries above to display side-by-side comparative analysis.</p>
        </div>
      `;
      return;
    }

    const cA = this.countryA;
    const cB = this.countryB;

    // Relative percentage calculations for visual comparison
    const maxPop = Math.max(cA.population || 1, cB.population || 1);
    const popPctA = Math.round(((cA.population || 0) / maxPop) * 100);
    const popPctB = Math.round(((cB.population || 0) / maxPop) * 100);

    const maxArea = Math.max(cA.area || 1, cB.area || 1);
    const areaPctA = Math.round(((cA.area || 0) / maxArea) * 100);
    const areaPctB = Math.round(((cB.area || 0) / maxArea) * 100);

    // Density
    const densityA = cA.area ? (cA.population / cA.area).toFixed(1) : 'N/A';
    const densityB = cB.area ? (cB.population / cB.area).toFixed(1) : 'N/A';

    this.container.innerHTML = `
      <!-- Country A Card -->
      <div class="compare-country-card">
        <div class="compare-card-header">
          <img src="${cA.flags?.svg || cA.flags?.png}" alt="${cA.name.common} Flag" class="compare-flag" />
          <h2 class="compare-title">${cA.name.common}</h2>
          <div class="compare-region">${cA.region} &bull; ${cA.capital ? cA.capital[0] : 'No Capital'}</div>
        </div>

        <div class="compare-metrics-list">
          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>Population</span>
              <span class="compare-metric-val">${countriesService.formatNumber(cA.population)}</span>
            </div>
            <div class="compare-progress-bar">
              <div class="compare-progress-fill fill-left" style="width: ${popPctA}%;"></div>
            </div>
          </div>

          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>Land Area</span>
              <span class="compare-metric-val">${countriesService.formatNumber(cA.area)} km²</span>
            </div>
            <div class="compare-progress-bar">
              <div class="compare-progress-fill fill-left" style="width: ${areaPctA}%;"></div>
            </div>
          </div>

          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>Population Density</span>
              <span class="compare-metric-val">${densityA} / km²</span>
            </div>
          </div>

          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>Driving Side</span>
              <span class="compare-metric-val">${(cA.car?.side || 'Right').toUpperCase()}</span>
            </div>
          </div>

          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>Currencies</span>
              <span class="compare-metric-val">${countriesService.getCurrenciesString(cA)}</span>
            </div>
          </div>

          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>Languages</span>
              <span class="compare-metric-val">${countriesService.getLanguagesString(cA)}</span>
            </div>
          </div>

          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>UN Member</span>
              <span class="compare-metric-val">${cA.unMember ? 'Yes 🇺🇳' : 'No'}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Country B Card -->
      <div class="compare-country-card">
        <div class="compare-card-header">
          <img src="${cB.flags?.svg || cB.flags?.png}" alt="${cB.name.common} Flag" class="compare-flag" />
          <h2 class="compare-title">${cB.name.common}</h2>
          <div class="compare-region">${cB.region} &bull; ${cB.capital ? cB.capital[0] : 'No Capital'}</div>
        </div>

        <div class="compare-metrics-list">
          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>Population</span>
              <span class="compare-metric-val">${countriesService.formatNumber(cB.population)}</span>
            </div>
            <div class="compare-progress-bar">
              <div class="compare-progress-fill fill-right" style="width: ${popPctB}%;"></div>
            </div>
          </div>

          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>Land Area</span>
              <span class="compare-metric-val">${countriesService.formatNumber(cB.area)} km²</span>
            </div>
            <div class="compare-progress-bar">
              <div class="compare-progress-fill fill-right" style="width: ${areaPctB}%;"></div>
            </div>
          </div>

          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>Population Density</span>
              <span class="compare-metric-val">${densityB} / km²</span>
            </div>
          </div>

          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>Driving Side</span>
              <span class="compare-metric-val">${(cB.car?.side || 'Right').toUpperCase()}</span>
            </div>
          </div>

          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>Currencies</span>
              <span class="compare-metric-val">${countriesService.getCurrenciesString(cB)}</span>
            </div>
          </div>

          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>Languages</span>
              <span class="compare-metric-val">${countriesService.getLanguagesString(cB)}</span>
            </div>
          </div>

          <div class="compare-metric-row">
            <div class="compare-metric-label">
              <span>UN Member</span>
              <span class="compare-metric-val">${cB.unMember ? 'Yes 🇺🇳' : 'No'}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

export const compareView = new CompareView();
