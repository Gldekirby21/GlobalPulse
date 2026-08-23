/**
 * Profile Manager — User Profile & Avatar CRUD
 * Allows users to upload/change/delete profile images, customize their
 * display name, bio/motto, base location, travel styles, and dream destinations.
 */

import { supabaseService } from '../services/supabaseService.js';
import { gamificationService, BADGES, gamificationBadges } from '../services/gamificationService.js';
import { countriesService } from '../services/countriesService.js';
import { isAuthenticated, bindAuthTriggers } from '../utils/access.js';

const TRAVEL_STYLES = [
  { id: 'backpacker', label: '🎒 Backpacker', desc: 'Budget & adventure focused' },
  { id: 'cultural', label: '🏛️ Cultural Wanderer', desc: 'History, heritage & museums' },
  { id: 'nature', label: '🌲 Nature & Wildlife', desc: 'Mountains, hiking & national parks' },
  { id: 'foodie', label: '🍜 Foodie Explorer', desc: 'Street food, local cuisines & markets' },
  { id: 'solo', label: '✈️ Solo Explorer', desc: 'Independent journeys & new perspectives' },
  { id: 'island', label: '🏖️ Beach & Island Hopper', desc: 'Coasts, diving & tropical retreats' },
  { id: 'luxury', label: '✨ Luxury & Leisure', desc: 'Resorts, fine stays & comfort' },
  { id: 'photographer', label: '📸 Travel Photographer', desc: 'Capturing breathtaking landscapes' }
];

const AVATAR_COLORS = [
  '#06b6d4', '#3b82f6', '#8b5cf6', '#10b981',
  '#f59e0b', '#f43f5e', '#ec4899', '#22d3ee'
];

class ProfileManager {
  constructor() {
    this.modal = null;
    this.activeTab = 'view'; // 'view' | 'edit'
    this.pendingAvatarUrl = null;
    this.pendingCoverUrl = null;
    this.pendingAvatarColor = null;
    this._bindGlobalEvents();
  }

  _bindGlobalEvents() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-profile-action]');
      if (!btn) return;
      const action = btn.dataset.profileAction;
      if (action === 'open') this.open('view');
      if (action === 'edit') this.open('edit');
      if (action === 'view-user') this.openUserProfile(btn.dataset.userId);
    });
  }

  ensureModal() {
    if (this.modal) return this.modal;

    this.modal = document.createElement('div');
    this.modal.className = 'auth-modal-overlay';
    this.modal.id = 'profileModal';
    this.modal.hidden = true;
    this.modal.innerHTML = `
      <div class="auth-modal-card profile-card-dialog">
        <button class="auth-modal-close" id="profileCloseBtn" aria-label="Close dialog">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="profile-tabs-header">
          <button class="profile-tab active" data-tab="view" id="profTabView">
            <i class="fa-solid fa-id-card"></i> Explorer Profile
          </button>
          <button class="profile-tab" data-tab="edit" id="profTabEdit">
            <i class="fa-solid fa-user-pen"></i> Edit Profile & Photo
          </button>
        </div>
        <div id="profileModalBody" class="profile-modal-body"></div>
      </div>
    `;

    document.body.appendChild(this.modal);

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    document.getElementById('profileCloseBtn')?.addEventListener('click', () => this.close());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.hidden) this.close();
    });

    document.getElementById('profTabView')?.addEventListener('click', () => this.switchTab('view'));
    document.getElementById('profTabEdit')?.addEventListener('click', () => this.switchTab('edit'));

    return this.modal;
  }

  open(tab = 'view') {
    if (!isAuthenticated()) {
      window.globalPulseApp?.showToast?.('Please sign in to view and customize your Explorer profile.', 'info');
      return;
    }
    this.ensureModal();
    this.activeTab = tab;
    this.modal.hidden = false;
    requestAnimationFrame(() => this.modal.classList.add('open'));
    this.switchTab(tab);
  }

  close() {
    if (!this.modal) return;
    this.modal.classList.remove('open');
    setTimeout(() => { this.modal.hidden = true; }, 250);
  }

  switchTab(tab) {
    this.activeTab = tab;
    document.getElementById('profTabView')?.classList.toggle('active', tab === 'view');
    document.getElementById('profTabEdit')?.classList.toggle('active', tab === 'edit');
    if (tab === 'view') this.renderView();
    else this.renderEdit();
  }

  /* --------------------------------------------------------------------------
     READ: Render Explorer Profile View
     -------------------------------------------------------------------------- */
  async renderView() {
    const body = document.getElementById('profileModalBody');
    if (!body) return;

    const prof = supabaseService.profile || {};
    const lvl = gamificationService.levelFor(prof.xp || 0);
    const badges = Array.isArray(prof.badges) ? prof.badges : [];

    // Fetch count of visited countries
    let visitedCount = 0;
    if (supabaseService.user) {
      const { count } = await supabaseService.client
        .from('visited_countries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', supabaseService.user.id);
      visitedCount = count || 0;
    }

    const avatarHtml = this._getAvatarHtml(prof, 72);
    const displayName = prof.full_name ? `${prof.full_name} (@${prof.username})` : `@${prof.username || 'explorer'}`;
    const bioText = prof.bio || 'Passionate explorer journeying across the world with GlobalPulse 🌍';
    const baseLoc = [prof.home_city, prof.home_country].filter(Boolean).join(', ') || 'Global Citizen';
    const styleObj = TRAVEL_STYLES.find(s => s.id === prof.travel_style);

    body.innerHTML = `
      <div class="profile-view-wrap">
        <!-- Top Profile Cover Card -->
        <div class="profile-cover-wrap" style="height:125px; border-radius:var(--radius-md) var(--radius-md) 0 0; position:relative; overflow:hidden; background:linear-gradient(135deg, #0ea5e9, #6366f1); margin-bottom:-35px;">
          ${prof.cover_url ? `<img src="${prof.cover_url}" alt="Cover" style="width:100%; height:100%; object-fit:cover;" />` : ''}
        </div>
        <div class="profile-header-banner" style="position:relative; z-index:2;">
          <div class="profile-avatar-container">
            ${avatarHtml}
          </div>
          <div class="profile-header-meta">
            <h2 class="profile-name-title">${prof.full_name || prof.username || 'Explorer'}</h2>
            <div class="profile-username-tag">@${prof.username || 'explorer'}</div>
            <div class="profile-badge-pill">
              <span class="level-pill">${lvl.name}</span>
              <span class="profile-xp-text"><i class="fa-solid fa-bolt"></i> ${prof.xp || 0} XP</span>
            </div>
          </div>
          <button class="profile-quick-edit-btn" data-profile-action="edit" title="Edit Profile">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
        </div>

        <!-- Explorer Motto / Bio -->
        <div class="profile-bio-box">
          <i class="fa-solid fa-quote-left bio-quote-icon"></i>
          <p class="profile-bio-text">${this._escapeHtml(bioText)}</p>
        </div>

        <!-- Traveler Highlights Grid -->
        <div class="profile-details-grid">
          <div class="prof-detail-item">
            <div class="prof-detail-label"><i class="fa-solid fa-house-chimney"></i> Home Base</div>
            <div class="prof-detail-value">${this._escapeHtml(baseLoc)}</div>
          </div>

          <div class="prof-detail-item">
            <div class="prof-detail-label"><i class="fa-solid fa-compass"></i> Travel Style</div>
            <div class="prof-detail-value">${styleObj ? styleObj.label : '🎒 Explorer'}</div>
          </div>

          <div class="prof-detail-item">
            <div class="prof-detail-label"><i class="fa-solid fa-plane-departure"></i> Dream Destination</div>
            <div class="prof-detail-value">${prof.dream_destination ? this._escapeHtml(prof.dream_destination) : 'Anywhere new ✨'}</div>
          </div>

          <div class="prof-detail-item">
            <div class="prof-detail-label"><i class="fa-solid fa-passport"></i> World Visited</div>
            <div class="prof-detail-value font-highlight">${visitedCount} Countries</div>
          </div>

          ${prof.website_or_social ? `
            <div class="prof-detail-item full-width">
              <div class="prof-detail-label"><i class="fa-solid fa-link"></i> Social / Portfolio</div>
              <div class="prof-detail-value">
                <a href="${prof.website_or_social.startsWith('http') ? prof.website_or_social : `https://${prof.website_or_social}`}" target="_blank" rel="noopener noreferrer" class="profile-link-external">
                  ${this._escapeHtml(prof.website_or_social)} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.75rem;"></i>
                </a>
              </div>
            </div>` : ''}
        </div>

        <!-- Badges Section -->
        ${badges.length ? `
          <div class="profile-badges-section">
            <div class="prof-section-title"><i class="fa-solid fa-award"></i> Explorer Achievements</div>
            <div class="badge-row">
              ${badges.map(k => {
      const b = gamificationBadges[k];
      return b ? `<span class="badge-chip" title="${b.label}"><i class="fa-solid ${b.icon}"></i> ${b.label}</span>` : '';
    }).join('')}
            </div>
          </div>` : ''}
      </div>
    `;
  }

  /* --------------------------------------------------------------------------
     UPDATE & CREATE: Render Profile & Avatar Editor
     -------------------------------------------------------------------------- */
  renderEdit() {
    const body = document.getElementById('profileModalBody');
    if (!body) return;

    const prof = supabaseService.profile || {};
    this.pendingAvatarUrl = prof.avatar_url || null;
    this.pendingAvatarColor = prof.avatar_color || '#06b6d4';

    const avatarHtml = this._getAvatarHtml({
      avatar_url: this.pendingAvatarUrl,
      avatar_color: this.pendingAvatarColor,
      username: prof.username
    }, 80, 'editAvatarPreview');

    body.innerHTML = `
      <form id="profileEditForm" class="profile-edit-form">
        <!-- Avatar Upload / Selection Card -->
        <div class="avatar-edit-section">
          <div class="avatar-upload-col">
            <div class="avatar-preview-wrap" id="avatarPreviewWrap">
              ${avatarHtml}
              <label class="avatar-upload-overlay" for="avatarFileInput" title="Upload new photo">
                <i class="fa-solid fa-camera"></i>
              </label>
              <input type="file" id="avatarFileInput" accept="image/png, image/jpeg, image/webp, image/gif" hidden />
            </div>

            <div class="avatar-action-buttons">
              <button type="button" class="btn-secondary btn-sm" id="btnTriggerUpload">
                <i class="fa-solid fa-cloud-arrow-up"></i> Upload Photo
              </button>
              ${this.pendingAvatarUrl ? `
                <button type="button" class="btn-danger-outline btn-sm" id="btnRemoveAvatar">
                  <i class="fa-solid fa-trash-can"></i> Remove
                </button>` : ''}
            </div>
            <small class="avatar-hint">PNG, JPG, WebP (Auto-optimized &lt; 100KB)</small>
          </div>

          <!-- Color theme picker for initials -->
          <div class="avatar-colors-col">
            <div class="form-label-title"><i class="fa-solid fa-palette"></i> Avatar Accent Color</div>
            <div class="color-swatches-grid">
              ${AVATAR_COLORS.map(c => `
                <button type="button" class="color-swatch-btn ${c === this.pendingAvatarColor ? 'selected' : ''}"
                  style="background:${c};" data-color="${c}" aria-label="Select color ${c}"></button>
              `).join('')}
            </div>
          </div>
        </div>

        <hr class="profile-divider" />

        <!-- Form Inputs Grid -->
        <div class="profile-form-grid">
          <div class="form-group full-width">
            <label for="profCoverUrl"><i class="fa-solid fa-panorama"></i> Cover Banner Image URL</label>
            <input type="text" id="profCoverUrl" class="profile-input" maxlength="255"
              placeholder="e.g. https://images.unsplash.com/... or direct image link" value="${this._escapeHtml(prof.cover_url || '')}" />
          </div>

          <div class="form-group">
            <label for="profFullName"><i class="fa-solid fa-user"></i> Full / Display Name</label>
            <input type="text" id="profFullName" class="profile-input" maxlength="40"
              placeholder="e.g. Kirby Geldore" value="${this._escapeHtml(prof.full_name || '')}" />
          </div>

          <div class="form-group">
            <label for="profUsername"><i class="fa-solid fa-at"></i> Username (Unique Tag)</label>
            <input type="text" id="profUsername" class="profile-input" maxlength="24" required
              placeholder="username" value="${this._escapeHtml(prof.username || '')}" />
          </div>

          <div class="form-group full-width">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <label for="profBio"><i class="fa-solid fa-feather-pointed"></i> Traveler Motto & Bio</label>
              <span id="bioCharCount" class="char-counter">${(prof.bio || '').length}/180</span>
            </div>
            <textarea id="profBio" class="profile-textarea" maxlength="180" rows="3"
              placeholder="Share your traveler philosophy, favorite destinations, or what inspires you to explore...">${this._escapeHtml(prof.bio || '')}</textarea>
          </div>

          <div class="form-group">
            <label for="profHomeCountry"><i class="fa-solid fa-earth-americas"></i> Home Country</label>
            <input type="text" id="profHomeCountry" class="profile-input" maxlength="40"
              placeholder="e.g. Philippines" value="${this._escapeHtml(prof.home_country || '')}" />
          </div>

          <div class="form-group">
            <label for="profHomeCity"><i class="fa-solid fa-city"></i> Home Base City</label>
            <input type="text" id="profHomeCity" class="profile-input" maxlength="40"
              placeholder="e.g. Manila" value="${this._escapeHtml(prof.home_city || '')}" />
          </div>

          <div class="form-group">
            <label for="profTravelStyle"><i class="fa-solid fa-suitcase-rolling"></i> Primary Travel Style</label>
            <select id="profTravelStyle" class="profile-select">
              <option value="">Select your travel style...</option>
              ${TRAVEL_STYLES.map(s => `
                <option value="${s.id}" ${prof.travel_style === s.id ? 'selected' : ''}>
                  ${s.label} — ${s.desc}
                </option>
              `).join('')}
            </select>
          </div>

          <div class="form-group">
            <label for="profDreamDest"><i class="fa-solid fa-plane-departure"></i> Top Dream Destination</label>
            <input type="text" id="profDreamDest" class="profile-input" maxlength="40"
              placeholder="e.g. Kyoto, Japan or Iceland" value="${this._escapeHtml(prof.dream_destination || '')}" />
          </div>

          <div class="form-group full-width">
            <label for="profSocial"><i class="fa-solid fa-link"></i> Social Handle / Website</label>
            <input type="text" id="profSocial" class="profile-input" maxlength="60"
              placeholder="e.g. @explorer_journey or instagram.com/..." value="${this._escapeHtml(prof.website_or_social || '')}" />
          </div>
        </div>

        <div id="profileEditError" class="auth-error" style="display:none; margin-top:1rem;"></div>

        <!-- Form Actions (Save & Reset) -->
        <div class="profile-edit-actions">
          <button type="button" class="btn-secondary" id="btnResetProfileFields">
            <i class="fa-solid fa-arrow-rotate-left"></i> Reset Fields
          </button>
          <button type="submit" class="btn-primary" id="btnSaveProfile">
            <i class="fa-solid fa-floppy-disk"></i> Save Profile Changes
          </button>
        </div>
      </form>
    `;

    // --- Wire Event Handlers ---
    const fileInput = document.getElementById('avatarFileInput');
    document.getElementById('btnTriggerUpload')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => this._handleFileSelect(e));

    document.getElementById('btnRemoveAvatar')?.addEventListener('click', () => {
      this.pendingAvatarUrl = null;
      this._updateAvatarPreview(prof.username);
    });

    body.querySelectorAll('.color-swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        body.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.pendingAvatarColor = btn.dataset.color;
        this._updateAvatarPreview(prof.username);
      });
    });

    const bioInput = document.getElementById('profBio');
    const counter = document.getElementById('bioCharCount');
    bioInput?.addEventListener('input', () => {
      if (counter) counter.textContent = `${bioInput.value.length}/180`;
    });

    document.getElementById('btnResetProfileFields')?.addEventListener('click', () => {
      if (confirm('Reset all bio and personal details to default?')) {
        document.getElementById('profFullName').value = '';
        document.getElementById('profBio').value = '';
        document.getElementById('profHomeCountry').value = '';
        document.getElementById('profHomeCity').value = '';
        document.getElementById('profTravelStyle').value = '';
        document.getElementById('profDreamDest').value = '';
        document.getElementById('profSocial').value = '';
        if (counter) counter.textContent = '0/180';
      }
    });

    document.getElementById('profileEditForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleProfileSave();
    });
  }

  /* --------------------------------------------------------------------------
     Image Compression & Preview Helper
     -------------------------------------------------------------------------- */
  async _handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, WebP).');
      return;
    }

    try {
      const optimizedBase64 = await this._compressImage(file, 280, 280, 0.85);
      this.pendingAvatarUrl = optimizedBase64;
      const username = document.getElementById('profUsername')?.value || 'user';
      this._updateAvatarPreview(username);
    } catch (err) {
      console.warn('Image optimization error:', err);
      alert('Could not process the selected image. Please choose another photo.');
    }
  }

  _updateAvatarPreview(username) {
    const wrap = document.getElementById('avatarPreviewWrap');
    if (!wrap) return;
    const overlay = wrap.querySelector('.avatar-upload-overlay');
    const input = wrap.querySelector('#avatarFileInput');

    const html = this._getAvatarHtml({
      avatar_url: this.pendingAvatarUrl,
      avatar_color: this.pendingAvatarColor,
      username: username || 'explorer'
    }, 80, 'editAvatarPreview');

    wrap.innerHTML = html;
    if (overlay) wrap.appendChild(overlay);
    if (input) wrap.appendChild(input);
  }

  _compressImage(file, maxWidth = 280, maxHeight = 280, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              width = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/webp', quality);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = readerEvent.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* --------------------------------------------------------------------------
     UPDATE: Save to Supabase Database
     -------------------------------------------------------------------------- */
  async _handleProfileSave() {
    if (!supabaseService.user || !supabaseService.configured) return;

    const username = document.getElementById('profUsername')?.value.trim();
    const fullName = document.getElementById('profFullName')?.value.trim();
    const bio = document.getElementById('profBio')?.value.trim();
    const homeCountry = document.getElementById('profHomeCountry')?.value.trim();
    const homeCity = document.getElementById('profHomeCity')?.value.trim();
    const travelStyle = document.getElementById('profTravelStyle')?.value;
    const dreamDest = document.getElementById('profDreamDest')?.value.trim();
    const social = document.getElementById('profSocial')?.value.trim();
    const errorBox = document.getElementById('profileEditError');
    const saveBtn = document.getElementById('btnSaveProfile');

    const coverUrl = document.getElementById('profCoverUrl')?.value.trim();

    if (!username) {
      if (errorBox) {
        errorBox.textContent = 'Username is required.';
        errorBox.style.display = 'block';
      }
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    try {
      const updateData = {
        username,
        full_name: fullName || null,
        bio: bio || null,
        home_country: homeCountry || null,
        home_city: homeCity || null,
        travel_style: travelStyle || null,
        dream_destination: dreamDest || null,
        website_or_social: social || null,
        cover_url: coverUrl || null,
        avatar_color: this.pendingAvatarColor || '#06b6d4',
        avatar_url: this.pendingAvatarUrl || null,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabaseService.client
        .from('profiles')
        .update(updateData)
        .eq('id', supabaseService.user.id)
        .select()
        .single();

      if (error) throw error;

      // Update local service profile cache
      supabaseService.profile = { ...supabaseService.profile, ...updateData };

      // Award profile completion badge if bio + home_country + travel_style are set
      if (bio && homeCountry && travelStyle) {
        gamificationService.awardXp(50).catch(console.warn);
      }

      // Re-render auth chip in header
      const auth = window.globalPulseApp?.authModal || {};
      if (auth.renderAuthArea) {
        auth.renderAuthArea({ user: supabaseService.user, profile: supabaseService.profile });
      }

      // Notify map & other components to refresh the avatar everywhere
      window.dispatchEvent(new CustomEvent('globalpulse:profileupdated', {
        detail: { profile: supabaseService.profile }
      }));

      window.globalPulseApp?.showToast?.('Explorer profile updated successfully! ✨', 'success');

      // Return to Profile View
      this.switchTab('view');
    } catch (err) {
      console.warn('Profile save failed:', err);
      if (errorBox) {
        errorBox.textContent = err.message || 'Failed to save profile. Please try again.';
        errorBox.style.display = 'block';
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Profile Changes';
      }
    }
  }

  /* --------------------------------------------------------------------------
     Public Profile Card (For viewing any other explorer)
     -------------------------------------------------------------------------- */
  async openUserProfile(userId) {
    if (!userId || !supabaseService.configured) return;
    this.ensureModal();

    const body = document.getElementById('profileModalBody');
    if (!body) return;

    this.modal.hidden = false;
    requestAnimationFrame(() => this.modal.classList.add('open'));
    body.innerHTML = `
      <div style="text-align:center; padding: 3rem 0;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:var(--accent-cyan);"></i>
        <p style="color:var(--text-muted); margin-top:0.75rem;">Loading explorer profile...</p>
      </div>`;

    const { data: prof } = await supabaseService.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!prof) {
      body.innerHTML = `<p class="community-empty">Explorer profile not found.</p>`;
      return;
    }

    const lvl = gamificationService.levelFor(prof.xp || 0);
    const badges = Array.isArray(prof.badges) ? prof.badges : [];
    const { count: visitedCount } = await supabaseService.client
      .from('visited_countries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const avatarHtml = this._getAvatarHtml(prof, 68);
    const styleObj = TRAVEL_STYLES.find(s => s.id === prof.travel_style);
    const baseLoc = [prof.home_city, prof.home_country].filter(Boolean).join(', ') || 'Global Explorer';

    body.innerHTML = `
      <div class="profile-view-wrap">
        <div class="profile-header-banner">
          <div class="profile-avatar-container">
            ${avatarHtml}
          </div>
          <div class="profile-header-meta">
            <h2 class="profile-name-title">${prof.full_name || prof.username || 'Explorer'}</h2>
            <div class="profile-username-tag">@${prof.username || 'explorer'}</div>
            <div class="profile-badge-pill">
              <span class="level-pill">${lvl.name}</span>
              <span class="profile-xp-text"><i class="fa-solid fa-bolt"></i> ${prof.xp || 0} XP</span>
            </div>
          </div>
        </div>

        ${prof.bio ? `
          <div class="profile-bio-box">
            <i class="fa-solid fa-quote-left bio-quote-icon"></i>
            <p class="profile-bio-text">${this._escapeHtml(prof.bio)}</p>
          </div>` : ''}

        <div class="profile-details-grid">
          <div class="prof-detail-item">
            <div class="prof-detail-label"><i class="fa-solid fa-house-chimney"></i> Home Base</div>
            <div class="prof-detail-value">${this._escapeHtml(baseLoc)}</div>
          </div>

          <div class="prof-detail-item">
            <div class="prof-detail-label"><i class="fa-solid fa-compass"></i> Travel Style</div>
            <div class="prof-detail-value">${styleObj ? styleObj.label : '🎒 Adventurer'}</div>
          </div>

          <div class="prof-detail-item">
            <div class="prof-detail-label"><i class="fa-solid fa-passport"></i> Visited Countries</div>
            <div class="prof-detail-value font-highlight">${visitedCount || 0} Countries</div>
          </div>

          <div class="prof-detail-item">
            <div class="prof-detail-label"><i class="fa-solid fa-plane-departure"></i> Dream Destination</div>
            <div class="prof-detail-value">${prof.dream_destination ? this._escapeHtml(prof.dream_destination) : 'World'}</div>
          </div>
        </div>

        ${badges.length ? `
          <div class="profile-badges-section">
            <div class="prof-section-title"><i class="fa-solid fa-award"></i> Badges Earned</div>
            <div class="badge-row">
              ${badges.map(k => {
      const b = gamificationBadges[k];
      return b ? `<span class="badge-chip" title="${b.label}"><i class="fa-solid ${b.icon}"></i> ${b.label}</span>` : '';
    }).join('')}
            </div>
          </div>` : ''}
      </div>
    `;
  }

  /* --------------------------------------------------------------------------
     Avatar & Escaping Helpers
     -------------------------------------------------------------------------- */
  _getAvatarHtml(prof, size = 44, extraClass = '') {
    if (prof.avatar_url) {
      return `
        <img src="${prof.avatar_url}" alt="${prof.username || 'Avatar'}"
          class="avatar-photo ${extraClass}" style="width:${size}px; height:${size}px; border-radius:50%; object-fit:cover; border:2.5px solid var(--accent-cyan);" />
      `;
    }
    const initial = (prof.username || '?').charAt(0).toUpperCase();
    const color = prof.avatar_color || '#06b6d4';
    return `
      <span class="avatar-dot ${extraClass}" style="--avatar:${color}; width:${size}px; height:${size}px; font-size:${Math.round(size * 0.42)}px; font-weight:800;">
        ${initial}
      </span>
    `;
  }

  _escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m]));
  }
}

export const profileManager = new ProfileManager();
