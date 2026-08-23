/**
 * Countries Explorer & Modal View Component
 * Renders country cards, handles filters/sorting, and controls rich detail modal.
 */

import { countriesService } from '../services/countriesService.js';
import { favoritesManager } from './favorites.js';
import { passport } from './passport.js';
import { supabaseService } from '../services/supabaseService.js';
import { authModal } from './authModal.js';

class CountriesView {
  constructor() {
    this.container = null;
    this.modal = null;
    this.currentCountry = null;
    this.activeRegion = 'All';
    this.currentSort = 'name_asc';
    this.searchQuery = '';
    this.onLocateCountryOnMap = null;
  }

  init(containerId = 'countriesGrid', modalId = 'countryDetailModal') {
    this.container = document.getElementById(containerId);
    this.modal = document.getElementById(modalId);
    this.setupModalListeners();
  }

  setOnLocate(callback) {
    this.onLocateCountryOnMap = callback;
  }

  /**
   * Render countries grid based on current filters
   */
  render() {
    if (!this.container) return;

    const filtered = countriesService.filterCountries({
      query: this.searchQuery,
      region: this.activeRegion,
      sortBy: this.currentSort
    });

    const countElement = document.getElementById('countriesCountMeta');
    if (countElement) {
      countElement.textContent = `Showing ${filtered.length} countries`;
    }

    if (filtered.length === 0) {
      this.container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
          <i class="fa-solid fa-earth-americas" style="font-size: 3rem; margin-bottom: 1rem; color: var(--border-glass-strong);"></i>
          <h3>No countries matched your search</h3>
          <p style="margin-top: 0.5rem; font-size: 0.9rem;">Try searching for another name, capital, or reset region filter.</p>
        </div>
      `;
      return;
    }

    this.container.innerHTML = filtered.map(country => {
      const isFav = favoritesManager.isFavorite(country.cca3 || country.name.common);
      const flagUrl = country.flags?.svg || country.flags?.png || '';
      const commonName = country.name.common;
      const capital = country.capital ? country.capital[0] : 'None';
      const population = countriesService.formatNumber(country.population);
      const region = country.region || 'World';

      return `
        <div class="country-card" data-cca3="${country.cca3}" id="country-card-${country.cca3}">
          <div class="country-card-flag-wrap">
            <img src="${flagUrl}" alt="${commonName} Flag" class="country-card-flag" loading="lazy" />
            <span class="country-card-region-badge">${region}</span>
          </div>
          <div class="country-card-body">
            <h3 class="country-card-title">${commonName}</h3>
            <p class="country-card-native">${country.name.official || ''}</p>
            
            <div class="country-card-stats">
              <div class="country-card-stat-row">
                <span><i class="fa-solid fa-landmark"></i> Capital:</span>
                <strong>${capital}</strong>
              </div>
              <div class="country-card-stat-row">
                <span><i class="fa-solid fa-users"></i> Population:</span>
                <strong>${population}</strong>
              </div>
              <div class="country-card-stat-row">
                <span><i class="fa-solid fa-ruler-combined"></i> Area:</span>
                <strong>${countriesService.formatNumber(country.area)} km²</strong>
              </div>
            </div>
          </div>
          <div class="country-card-footer">
            <span>Explore Facts <i class="fa-solid fa-arrow-right"></i></span>
            <button class="favorite-btn-card ${isFav ? 'active' : ''}" data-cca3="${country.cca3}" title="Save to bucket list" onclick="event.stopPropagation();">
              <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach click events
    this.container.querySelectorAll('.country-card').forEach(card => {
      card.addEventListener('click', () => {
        const cca3 = card.dataset.cca3;
        const country = countriesService.getCountryByCode(cca3);
        if (country) this.openDetailModal(country);
      });
    });

    // Favorite heart button events
    this.container.querySelectorAll('.favorite-btn-card').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!supabaseService.user) {
          if (window.globalPulseApp?.showToast) {
            window.globalPulseApp.showToast('Please sign in to save places to your bucket list! 🔒', 'info');
          }
          authModal.open('signin');
          return;
        }

        const cca3 = btn.dataset.cca3;
        const country = countriesService.getCountryByCode(cca3);
        if (country) {
          const added = favoritesManager.toggleFavorite({
            id: country.cca3,
            name: country.name.common,
            type: 'country',
            flag: country.flags?.svg || country.flags?.png,
            region: country.region,
            capital: country.capital?.[0] || 'N/A'
          });
          btn.classList.toggle('active', added);
          btn.innerHTML = `<i class="fa-${added ? 'solid' : 'regular'} fa-heart"></i>`;

          window.dispatchEvent(new CustomEvent('favoritesUpdated'));
        }
      });
    });
  }

  /**
   * Open full modal for a given country
   */
  openDetailModal(country) {
    if (!this.modal || !country) return;
    this.currentCountry = country;

    const flagUrl = country.flags?.svg || country.flags?.png || '';
    const coatArmsUrl = country.coatOfArms?.svg || country.coatOfArms?.png || '';
    const isFav = favoritesManager.isFavorite(country.cca3);

    // Populate Modal Content
    const flagBg = document.getElementById('modalFlagBg');
    const flagThumb = document.getElementById('modalFlagThumb');
    const nameElem = document.getElementById('modalCountryName');
    const officialElem = document.getElementById('modalOfficialName');
    const detailsContainer = document.getElementById('modalDetailsGrid');
    const bordersContainer = document.getElementById('modalBordersList');
    const favBtn = document.getElementById('modalFavBtn');

    if (flagBg) flagBg.src = flagUrl;
    if (flagThumb) flagThumb.src = flagUrl;
    if (nameElem) nameElem.textContent = country.name.common;
    if (officialElem) officialElem.textContent = country.name.official;

    if (favBtn) {
      favBtn.innerHTML = `<i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i> ${isFav ? 'Saved in Bucket List' : 'Save to Favorites'}`;
      favBtn.className = isFav ? 'btn-primary' : 'btn-secondary';
    }

    // Travel Passport stamp control
    passport.renderStampControls(country);

    if (detailsContainer) {
      detailsContainer.innerHTML = `
        <div class="detail-item">
          <div class="detail-label"><i class="fa-solid fa-landmark"></i> Capital City</div>
          <div class="detail-value">${country.capital ? country.capital.join(', ') : 'None'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label"><i class="fa-solid fa-users"></i> Population</div>
          <div class="detail-value">${countriesService.formatNumber(country.population)} people</div>
        </div>
        <div class="detail-item">
          <div class="detail-label"><i class="fa-solid fa-map"></i> Land Area</div>
          <div class="detail-value">${countriesService.formatNumber(country.area)} km²</div>
        </div>
        <div class="detail-item">
          <div class="detail-label"><i class="fa-solid fa-globe"></i> Region & Subregion</div>
          <div class="detail-value">${country.region} &bull; ${country.subregion || 'N/A'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label"><i class="fa-solid fa-coins"></i> Currencies</div>
          <div class="detail-value">${countriesService.getCurrenciesString(country)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label"><i class="fa-solid fa-language"></i> Official Languages</div>
          <div class="detail-value">${countriesService.getLanguagesString(country)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label"><i class="fa-solid fa-car"></i> Driving Side</div>
          <div class="detail-value">${country.car?.side ? (country.car.side.toUpperCase() + ' SIDE') : 'Right'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label"><i class="fa-solid fa-clock"></i> Timezone(s)</div>
          <div class="detail-value">${country.timezones ? country.timezones.slice(0, 2).join(', ') : 'UTC'}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label"><i class="fa-solid fa-flag-checkered"></i> UN Member Status</div>
          <div class="detail-value">${country.unMember ? 'Official UN Member 🇺🇳' : 'Non-Member'}</div>
        </div>
        ${coatArmsUrl ? `
          <div class="detail-item" style="display:flex; align-items:center; gap: 1rem;">
            <div>
              <div class="detail-label">National Coat of Arms</div>
              <div class="detail-value">Official Emblem</div>
            </div>
            <img src="${coatArmsUrl}" alt="Coat of Arms" style="height: 48px; object-fit: contain; margin-left: auto;" />
          </div>
        ` : ''}
      `;
    }

    // Border Countries
    if (bordersContainer) {
      if (country.borders && country.borders.length > 0) {
        bordersContainer.innerHTML = country.borders.map(borderCca3 => {
          const borderCountry = countriesService.getCountryByCode(borderCca3);
          const name = borderCountry ? borderCountry.name.common : borderCca3;
          return `<button class="border-chip" data-border-cca3="${borderCca3}">${name}</button>`;
        }).join('');

        bordersContainer.querySelectorAll('.border-chip').forEach(btn => {
          btn.addEventListener('click', () => {
            const bCca3 = btn.dataset.borderCca3;
            const bCountry = countriesService.getCountryByCode(bCca3);
            if (bCountry) this.openDetailModal(bCountry);
          });
        });
      } else {
        bordersContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">This country is an island or has no shared land borders.</span>';
      }
    }

    // Setup action buttons
    const mapBtn = document.getElementById('modalViewOnMapBtn');
    if (mapBtn) {
      mapBtn.onclick = () => {
        this.closeModal();
        if (this.onLocateCountryOnMap && country.latlng && country.latlng.length >= 2) {
          this.onLocateCountryOnMap(country.latlng[0], country.latlng[1], country.name.common);
        }
      };
    }

    const speakBtn = document.getElementById('modalSpeakBtn');
    if (speakBtn) {
      speakBtn.onclick = () => this.speakCountryFacts(country);
    }

    // Show modal
    this.modal.classList.add('open');
  }

  closeModal() {
    if (this.modal) {
      this.modal.classList.remove('open');
    }
  }

  setupModalListeners() {
    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) closeBtn.onclick = () => this.closeModal();

    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.closeModal();
      });
    }

    const favBtn = document.getElementById('modalFavBtn');
    if (favBtn) {
      favBtn.onclick = () => {
        if (!supabaseService.user) {
          if (window.globalPulseApp?.showToast) {
            window.globalPulseApp.showToast('Please sign in to save places to your bucket list! 🔒', 'info');
          }
          authModal.open('signin');
          return;
        }

        if (!this.currentCountry) return;
        const added = favoritesManager.toggleFavorite({
          id: this.currentCountry.cca3,
          name: this.currentCountry.name.common,
          type: 'country',
          flag: this.currentCountry.flags?.svg || this.currentCountry.flags?.png,
          region: this.currentCountry.region,
          capital: this.currentCountry.capital?.[0] || 'N/A'
        });

        favBtn.innerHTML = `<i class="fa-${added ? 'solid' : 'regular'} fa-heart"></i> ${added ? 'Saved in Bucket List' : 'Save to Favorites'}`;
        favBtn.className = added ? 'btn-primary' : 'btn-secondary';

        this.render(); // update hearts on grid
        window.dispatchEvent(new CustomEvent('favoritesUpdated'));
      };
    }
  }

  /**
   * Browser Speech Synthesis: Speaks country facts
   */
  speakCountryFacts(country) {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported in your browser.');
      return;
    }

    window.speechSynthesis.cancel(); // Stop any active speech

    const capital = country.capital ? country.capital[0] : 'an unstated capital';
    const text = `${country.name.common}, officially known as ${country.name.official}. Located in ${country.region}, with ${capital} as its capital. Population is approximately ${countriesService.formatNumber(country.population)} people.`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

export const countriesView = new CountriesView();
