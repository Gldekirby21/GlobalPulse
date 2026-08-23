/**
 * Distance & Haversine Flight Path Calculator
 * Computes great-circle distances, flight time estimates, and plots on Leaflet map.
 */

import { countriesService } from '../services/countriesService.js';
import { mapManager } from './mapManager.js';

class DistanceCalc {
  constructor() {
    this.selectFrom = null;
    this.selectTo = null;
    this.resultBanner = null;
    this.onViewOnMapCallback = null;
  }

  init(fromId = 'distanceFromSelect', toId = 'distanceToSelect', bannerId = 'distanceResultBanner') {
    this.selectFrom = document.getElementById(fromId);
    this.selectTo = document.getElementById(toId);
    this.resultBanner = document.getElementById(bannerId);

    if (this.selectFrom && this.selectTo) {
      this.populateSelects();

      this.selectFrom.addEventListener('change', () => this.calculate());
      this.selectTo.addEventListener('change', () => this.calculate());

      const swapBtn = document.getElementById('btnSwapDistance');
      if (swapBtn) {
        swapBtn.addEventListener('click', () => {
          const temp = this.selectFrom.value;
          this.selectFrom.value = this.selectTo.value;
          this.selectTo.value = temp;
          this.calculate();
        });
      }
    }
  }

  setOnViewOnMap(callback) {
    this.onViewOnMapCallback = callback;
  }

  populateSelects() {
    const countries = countriesService.filterCountries();
    const optionsHtml = countries.map(c => `<option value="${c.cca3}">${c.name.common}</option>`).join('');

    if (this.selectFrom) {
      this.selectFrom.innerHTML = '<option value="">Select Origin Country...</option>' + optionsHtml;
      const ph = countries.find(c => c.cca3 === 'PHL' || c.name.common === 'Philippines');
      if (ph) this.selectFrom.value = ph.cca3;
    }

    if (this.selectTo) {
      this.selectTo.innerHTML = '<option value="">Select Destination Country...</option>' + optionsHtml;
      const fr = countries.find(c => c.cca3 === 'FRA' || c.name.common === 'France');
      if (fr) this.selectTo.value = fr.cca3;
    }

    this.calculate();
  }

  /**
   * Haversine formula calculation
   */
  calculate() {
    if (!this.selectFrom || !this.selectTo || !this.resultBanner) return;

    const fromCode = this.selectFrom.value;
    const toCode = this.selectTo.value;

    if (!fromCode || !toCode || fromCode === toCode) {
      this.resultBanner.style.display = 'none';
      return;
    }

    const cFrom = countriesService.getCountryByCode(fromCode);
    const cTo = countriesService.getCountryByCode(toCode);

    if (!cFrom?.latlng || !cTo?.latlng || cFrom.latlng.length < 2 || cTo.latlng.length < 2) {
      this.resultBanner.style.display = 'none';
      return;
    }

    const lat1 = cFrom.latlng[0];
    const lon1 = cFrom.latlng[1];
    const lat2 = cTo.latlng[0];
    const lon2 = cTo.latlng[1];

    const distKm = this.getHaversineDistance(lat1, lon1, lat2, lon2);
    const distMiles = distKm * 0.621371;
    const distNautical = distKm * 0.539957;

    // Flight time estimate at 850 km/h + 30 min takeoff/landing
    const flightHours = (distKm / 850) + 0.5;
    const hours = Math.floor(flightHours);
    const minutes = Math.round((flightHours - hours) * 60);

    this.resultBanner.style.display = 'block';
    this.resultBanner.innerHTML = `
      <div style="font-size: 0.85rem; color: var(--accent-cyan); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">
        Great-Circle Distance
      </div>
      <div class="distance-number">${countriesService.formatNumber(Math.round(distKm))} km</div>
      <div style="font-size: 0.95rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
        &asymp; <strong>${countriesService.formatNumber(Math.round(distMiles))}</strong> Miles &bull; 
        <strong>${countriesService.formatNumber(Math.round(distNautical))}</strong> NM
      </div>

      <div style="display: flex; justify-content: center; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1.25rem; font-size: 0.9rem;">
        <div>
          <span style="color: var(--text-muted);"><i class="fa-solid fa-plane"></i> Est. Non-Stop Flight:</span>
          <strong>${hours}h ${minutes}m</strong>
        </div>
        <div>
          <span style="color: var(--text-muted);"><i class="fa-solid fa-location-dot"></i> Origin:</span>
          <strong>${cFrom.name.common} (${lat1.toFixed(2)}&deg;, ${lon1.toFixed(2)}&deg;)</strong>
        </div>
        <div>
          <span style="color: var(--text-muted);"><i class="fa-solid fa-flag-checkered"></i> Destination:</span>
          <strong>${cTo.name.common} (${lat2.toFixed(2)}&deg;, ${lon2.toFixed(2)}&deg;)</strong>
        </div>
      </div>

      <button class="btn-primary" id="btnViewFlightOnMap" style="margin: 0 auto;">
        <i class="fa-solid fa-map-location-dot"></i> Visualize Flight Arc on Interactive Map
      </button>
    `;

    const viewBtn = document.getElementById('btnViewFlightOnMap');
    if (viewBtn) {
      viewBtn.onclick = () => {
        mapManager.drawFlightPath(lat1, lon1, lat2, lon2, cFrom.name.common, cTo.name.common);
        if (this.onViewOnMapCallback) {
          this.onViewOnMapCallback();
        }
      };
    }
  }

  getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export const distanceCalc = new DistanceCalc();
