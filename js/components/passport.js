/**
 * Travel Passport — stamp visited countries & shareable profile card
 * Guests see a locked teaser; logged-in users can stamp countries,
 * view their collection, and copy a public profile link.
 */

import { supabaseService } from '../services/supabaseService.js';
import { gamificationService } from '../services/gamificationService.js';
import { countriesService } from '../services/countriesService.js';
import { isAuthenticated, lockOverlayHtml, bindAuthTriggers } from '../utils/access.js';

const TOTAL_COUNTRIES = 250;
const XP_PER_STAMP = 25;

class Passport {
  constructor() {
    this.modal = null;
    this.stampedSet = new Set(); // cca3 codes of current user
    this._map = null;
    this._bindGlobalActions();
  }

  /** Delegated handler for account-menu passport buttons */
  _bindGlobalActions() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-passport-action]');
      if (!el) return;
      if (el.dataset.passportAction === 'open') this.open();
      if (el.dataset.passportAction === 'copy-profile') this.copyProfileLink();
    });
  }

  /* ------------------------------ Data ------------------------------ */

  async refresh() {
    this.stampedSet.clear();
    if (!isAuthenticated()) return;

    const { data, error } = await supabaseService.client
      .from('visited_countries')
      .select('cca3')
      .eq('user_id', supabaseService.user.id);

    if (!error && Array.isArray(data)) {
      data.forEach((row) => this.stampedSet.add(row.cca3));
    }
  }

  isStamped(cca3) {
    return this.stampedSet.has(cca3);
  }

  /** Add or remove a stamp; awards XP + badges on insert. */
  async toggleStamp(country) {
    if (!isAuthenticated() || !country?.cca3) return false;

    if (this.isStamped(country.cca3)) {
      await supabaseService.client
        .from('visited_countries')
        .delete()
        .eq('user_id', supabaseService.user.id)
        .eq('cca3', country.cca3);
      this.stampedSet.delete(country.cca3);
      return false;
    }

    const { error } = await supabaseService.client
      .from('visited_countries')
      .insert({ user_id: supabaseService.user.id, cca3: country.cca3 });
    if (error) {
      console.warn('Stamp failed:', error.message);
      return this.isStamped(country.cca3);
    }

    this.stampedSet.add(country.cca3);
    await gamificationService.awardXp(XP_PER_STAMP);
    if (this.stampedSet.size >= 5) await gamificationService.grantBadge('visited_5');
    if (this.stampedSet.size >= 25) await gamificationService.grantBadge('visited_25');
    return true;
  }

  /* --------------------- Country-modal controls ---------------------- */

  /**
   * Inject/update the stamp button inside the country detail modal
   * (next to the favorites button). Call after openDetailModal renders.
   */
  renderStampControls(country) {
    const favBtn = document.getElementById('modalFavBtn');
    if (!favBtn || !favBtn.parentElement) return;

    let wrap = document.getElementById('stampBtnWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'stampBtnWrap';
      wrap.style.marginTop = '0.5rem';
      favBtn.parentElement.appendChild(wrap);
    }

    if (!isAuthenticated()) {
      wrap.innerHTML = `
        <button class="btn-secondary passport-stamp-btn" data-open-auth>
          <i class="fa-solid fa-stamp"></i> Stamp as Visited
          <span class="passport-lock-hint"><i class="fa-solid fa-lock"></i></span>
        </button>`;
      bindAuthTriggers(wrap);
      return;
    }

    const stamped = this.isStamped(country.cca3);
    wrap.innerHTML = `
      <button class="${stamped ? 'btn-primary' : 'btn-secondary'} passport-stamp-btn" id="modalStampBtn">
        <i class="fa-solid fa-stamp"></i>
        ${stamped ? 'Stamped in Your Passport ✓' : 'Stamp as Visited'}
      </button>`;

    document.getElementById('modalStampBtn')?.addEventListener('click', async () => {
      const nowStamped = await this.toggleStamp(country);
      this.renderStampControls(country);
      if (nowStamped) {
        // Lightweight inline feedback instead of a toast
        const btn = document.getElementById('modalStampBtn');
        btn?.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
          { duration: 350, easing: 'ease-out' }
        );
      }
    });
  }

  /* --------------------------- Passport modal ------------------------- */

  ensureModal() {
    if (this.modal) return this.modal;
    this.modal = document.createElement('div');
    this.modal.className = 'auth-modal-overlay';
    this.modal.id = 'passportModal';
    this.modal.hidden = true;
    this.modal.innerHTML = `
      <div class="auth-modal-card passport-card">
        <button class="auth-modal-close" id="passportClose" aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div id="passportBody"></div>
      </div>`;
    document.body.appendChild(this.modal);

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });
    document.getElementById('passportClose').addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.hidden) this.close();
    });
    return this.modal;
  }

  open() {
    this.ensureModal();
    this.modal.hidden = false;
    requestAnimationFrame(() => this.modal.classList.add('open'));
    this.renderOwn();
  }

  close() {
    if (!this.modal) return;
    this.modal.classList.remove('open');
    setTimeout(() => { this.modal.hidden = true; }, 250);
    if (this._map) { this._map.remove(); this._map = null; }
  }

  async renderOwn() {
    const body = this.ensureModal().querySelector('#passportBody');

    if (!isAuthenticated()) {
      body.innerHTML = `
        <div class="passport-header">
          <div class="auth-modal-logo"><i class="fa-solid fa-passport"></i></div>
          <h3>My Travel Passport</h3>
        </div>
        <div style="position:relative;">
          ${lockOverlayHtml('Create a free account to start collecting country stamps!')}
          <div style="filter: blur(2px); pointer-events: none; opacity:.6;">
            ${this._stampsGridHtml(this._sampleStamps())}
          </div>
        </div>`;
      bindAuthTriggers(body);
      return;
    }

    await this.refresh();
    const profile = supabaseService.profile || {};
    const lvl = gamificationService.levelFor(profile.xp || 0);
    const count = this.stampedSet.size;
    const pct = Math.round((count / TOTAL_COUNTRIES) * 100);

    const avatarHtml = profile.avatar_url
      ? `<img src="${profile.avatar_url}" alt="${profile.username || 'Explorer'}" class="avatar-photo" style="width:46px; height:46px; border-radius:50%; object-fit:cover; border:2px solid var(--accent-cyan);" />`
      : `<span class="avatar-dot" style="--avatar:${profile.avatar_color || '#06b6d4'}; width:46px; height:46px; font-size:1.1rem;">
          ${(profile.username || '?').charAt(0).toUpperCase()}
        </span>`;

    body.innerHTML = `
      <div class="passport-header">
        ${avatarHtml}
        <div>
          <h3>${profile.username || 'Explorer'}'s Passport</h3>
          <p class="passport-level"><i class="fa-solid fa-bolt"></i> ${lvl.name} • ${profile.xp || 0} XP</p>
        </div>
      </div>

      <div class="passport-stats">
        <div class="passport-stat">
          <strong>${count}</strong><span>/ ${TOTAL_COUNTRIES} countries</span>
        </div>
        <div class="passport-stat"><strong>${pct}%</strong><span>of the world</span></div>
      </div>

      <div id="passportMap" class="passport-map"></div>

      ${count ? this._stampsGridHtml(this._myStamps()) : `
        <p class="community-empty">No stamps yet — open any country and hit “Stamp as Visited”!</p>`}
    `;

    this._renderMiniMap();
  }

  _myStamps() {
    return [...this.stampedSet]
      .map((cca3) => ({ country: countriesService.getCountryByCode(cca3), cca3 }))
      .filter((s) => s.country);
  }

  _sampleStamps() {
    return this._pickSample().map((c) => ({ country: c, cca3: c.cca3 }));
  }

  _pickSample() {
    const all = countriesService.countries || [];
    return [...all].sort(() => Math.random() - 0.5).slice(0, 8);
  }

  _stampsGridHtml(stamps) {
    return `
      <div class="passport-grid">
        ${stamps.map(({ country }) => `
          <div class="passport-stamp">
            <img src="${country.flags?.png || ''}" alt="${country.name.common}" loading="lazy" />
            <span>${country.name.common}</span>
          </div>`).join('')}
      </div>`;
  }

  _renderMiniMap() {
    const el = document.getElementById('passportMap');
    if (!el || typeof L === 'undefined') return;

    this._map = L.map(el, {
      center: [20, 0],
      zoom: 1,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 6
    }).addTo(this._map);

    this._myStamps().forEach(({ country }) => {
      const [lat, lon] = country.latlng || [];
      if (!Number.isFinite(lat)) return;
      L.circleMarker([lat, lon], {
        radius: 5,
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.85,
        weight: 1
      })
        .bindTooltip(country.name.common)
        .addTo(this._map);
    });

    setTimeout(() => this._map?.invalidateSize(), 200);
  }

  /* -------------------------- Profile card ---------------------------- */

  async openProfileCard(userId) {
    if (!supabaseService.configured || !userId) return;

    const { data: prof } = await supabaseService.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (!prof) return;

    const { count } = await supabaseService.client
      .from('visited_countries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const lvl = gamificationService.levelFor(prof.xp || 0);
    const badges = Array.isArray(prof.badges) ? prof.badges : [];

    this.ensureModal();
    this.modal.hidden = false;
    requestAnimationFrame(() => this.modal.classList.add('open'));

    this.modal.querySelector('#passportBody').innerHTML = `
      <div class="passport-header">
        <span class="avatar-dot" style="--avatar:${prof.avatar_color || '#06b6d4'}; width:52px; height:52px; font-size:1.3rem;">
          ${(prof.username || '?').charAt(0).toUpperCase()}
        </span>
        <div>
          <h3>${prof.username || 'Explorer'}</h3>
          <p class="passport-level"><i class="fa-solid fa-bolt"></i> ${lvl.name} • ${prof.xp || 0} XP</p>
        </div>
      </div>
      <div class="passport-stats">
        <div class="passport-stat"><strong>${count ?? 0}</strong><span>countries visited</span></div>
        <div class="passport-stat"><strong>${badges.length}</strong><span>badges earned</span></div>
      </div>
      ${badges.length ? `
        <div class="badge-row">
          ${badges.map((key) => {
      const b = gamificationBadges[key];
      return b ? `<span class="badge-chip" title="${b.label}"><i class="fa-solid ${b.icon}"></i> ${b.label}</span>` : '';
    }).join('')}
        </div>` : ''}
    `;
  }

  copyProfileLink() {
    if (!supabaseService.user) return;
    const url = `${window.location.origin}${window.location.pathname}?explorer=${supabaseService.user.id}`;
    navigator.clipboard?.writeText(url).then(() => {
      const btn = document.querySelector('[data-passport-action="copy-profile"]');
      if (btn) {
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Link Copied!';
        setTimeout(() => { btn.innerHTML = original; }, 1800);
      }
    }).catch(() => { });
  }

  /** Open a shared profile when landing with ?explorer=<id>. */
  checkShareLink() {
    const id = new URLSearchParams(window.location.search).get('explorer');
    if (id) this.openProfileCard(id);
  }
}

// Badge catalog re-export for the profile card renderer
import { BADGES as gamificationBadges } from '../services/gamificationService.js';

export const passport = new Passport();
