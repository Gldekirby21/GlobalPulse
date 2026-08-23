/**
 * Pulse Stories Component
 * 24-Hour travel snapshots with auto-advancing fullscreen viewer modal.
 */

import { supabaseService } from '../services/supabaseService.js';
import { isAuthenticated } from '../utils/access.js';

class PulseStories {
  constructor() {
    this.container = null;
    this.stories = [];
    this.currentStoryIdx = 0;
    this.progressTimer = null;
    this.modal = null;
  }

  init(containerId = 'pulseStoriesBar') {
    this.container = document.getElementById(containerId);
    this.injectModal();
    this.loadStories();
  }

  injectModal() {
    if (document.getElementById('storyViewerModal')) return;

    this.modal = document.createElement('div');
    this.modal.id = 'storyViewerModal';
    this.modal.className = 'story-viewer-modal';
    this.modal.hidden = true;
    this.modal.innerHTML = `
      <div class="story-viewer-container">
        <div class="story-viewer-progress" id="storyProgressBars"></div>
        <header class="story-viewer-header">
          <div id="storyViewerAvatarWrap"></div>
          <div>
            <strong id="storyViewerAuthor">Explorer</strong>
            <div style="font-size:0.72rem; color:rgba(255,255,255,0.7);" id="storyViewerLocation"></div>
          </div>
          <button type="button" class="icon-btn" id="storyViewerCloseBtn" style="margin-left:auto; color:#fff;" aria-label="Close story">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </header>
        <div class="story-viewer-content" id="storyViewerContent">
          <img src="" alt="Story Media" class="story-viewer-media" id="storyViewerImg" />
          <div class="story-viewer-caption" id="storyViewerCaption"></div>
        </div>
        <button type="button" class="story-nav-btn prev" id="storyPrevBtn" style="position:absolute; left:10px; top:50%; z-index:20; background:rgba(0,0,0,0.5); color:#fff; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;"><i class="fa-solid fa-chevron-left"></i></button>
        <button type="button" class="story-nav-btn next" id="storyNextBtn" style="position:absolute; right:10px; top:50%; z-index:20; background:rgba(0,0,0,0.5); color:#fff; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
    `;
    document.body.appendChild(this.modal);

    document.getElementById('storyViewerCloseBtn')?.addEventListener('click', () => this.closeViewer());
    document.getElementById('storyPrevBtn')?.addEventListener('click', () => this.prevStory());
    document.getElementById('storyNextBtn')?.addEventListener('click', () => this.nextStory());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeViewer();
    });
  }

  async loadStories() {
    let list = [];
    if (supabaseService.configured) {
      const { data, error } = await supabaseService.client
        .from('stories')
        .select('*, profiles(username, full_name, avatar_url, avatar_color)')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (!error && data && data.length) {
        list = data;
      }
    }

    if (!list.length) {
      list = this.getMockStories();
    }

    this.stories = list;
    this.renderStoriesBar();
  }

  escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  safeUrl(url = '') {
    if (!url || typeof url !== 'string') return '';
    const clean = url.trim();
    if (/^(https?:\/\/|data:image\/|\/)/i.test(clean)) {
      return clean;
    }
    return 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80';
  }

  renderStoriesBar() {
    if (!this.container) return;

    const me = supabaseService.user;
    const myProf = supabaseService.profile || {};
    const myAvatar = this.safeUrl(myProf.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80');

    let html = `
      <!-- Add Story Card -->
      <div class="story-card story-create-card" id="btnCreateStory">
        <div class="story-create-top">
          <img src="${myAvatar}" alt="You" />
          <div class="story-create-btn-wrap">
            <i class="fa-solid fa-plus"></i>
          </div>
        </div>
        <div class="story-create-bottom">
          <span>Create Story</span>
        </div>
      </div>
    `;

    html += this.stories.map((story, idx) => {
      const p = story.profiles || {};
      const name = this.escapeHtml(p.full_name || p.username || 'Explorer');
      const avatarSrc = this.safeUrl(p.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80');
      const mediaUrl = this.safeUrl(story.media_url);

      return `
        <div class="story-card" data-story-idx="${idx}">
          <img src="${mediaUrl}" alt="${name}'s Story" class="story-card-bg" />
          <div class="story-avatar-wrap">
            <div class="story-avatar-ring">
              <img src="${avatarSrc}" alt="${name}" class="story-avatar-img" />
            </div>
          </div>
          <span class="story-author-name">${name}</span>
        </div>
      `;
    }).join('');

    this.container.innerHTML = html;

    // Click events
    this.container.querySelectorAll('[data-story-idx]').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = Number(card.dataset.storyIdx);
        this.openViewer(idx);
      });
    });

    document.getElementById('btnCreateStory')?.addEventListener('click', () => {
      this.promptCreateStory();
    });
  }

  promptCreateStory() {
    if (!isAuthenticated()) {
      window.globalPulseApp?.showToast?.('Please sign in to share a 24-hour story! 📸', 'info');
      window.globalPulseApp?.authModal?.open('signin');
      return;
    }

    const url = prompt('📸 Enter an Image URL for your 24-hour travel story (e.g. Unsplash or direct photo link):', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80');
    if (!url) return;

    const caption = prompt('📝 Add a quick caption (optional):', 'Paradise vibes 🌊');
    const loc = prompt('📍 Location tag (optional):', 'Maldives');

    this.saveStory(url, caption, loc);
  }

  async saveStory(media_url, caption, location_name) {
    const newStory = {
      id: `temp_story_${Date.now()}`,
      user_id: supabaseService.user.id,
      media_url,
      caption,
      location_name,
      created_at: new Date().toISOString(),
      profiles: supabaseService.profile || { username: 'You', avatar_color: '#06b6d4' }
    };

    this.stories.unshift(newStory);
    this.renderStoriesBar();
    window.globalPulseApp?.showToast?.('Story published! 🌟', 'success');

    await supabaseService.client.from('stories').insert({
      user_id: supabaseService.user.id,
      media_url,
      caption,
      location_name
    });
  }

  openViewer(index = 0) {
    if (!this.stories.length) return;
    this.currentStoryIdx = index;
    if (this.modal) this.modal.hidden = false;
    this.renderViewerSlide();
  }

  renderViewerSlide() {
    const story = this.stories[this.currentStoryIdx];
    if (!story) return this.closeViewer();

    const p = story.profiles || {};
    const name = p.full_name || p.username || 'Explorer';
    const avatarSrc = p.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';

    // Update Progress Bars
    const progressEl = document.getElementById('storyProgressBars');
    if (progressEl) {
      progressEl.innerHTML = this.stories.map((_, i) => `
        <div class="story-progress-seg">
          <div class="story-progress-fill" style="width: ${i < this.currentStoryIdx ? '100%' : i === this.currentStoryIdx ? '0%' : '0%'};"></div>
        </div>
      `).join('');
    }

    // Header Meta
    const authorEl = document.getElementById('storyViewerAuthor');
    const locEl = document.getElementById('storyViewerLocation');
    const avatarWrap = document.getElementById('storyViewerAvatarWrap');
    const imgEl = document.getElementById('storyViewerImg');
    const captionEl = document.getElementById('storyViewerCaption');

    if (authorEl) authorEl.textContent = name;
    if (locEl) locEl.textContent = story.location_name ? `📍 ${story.location_name}` : 'Traveler Story';
    if (avatarWrap) {
      avatarWrap.innerHTML = `<img src="${avatarSrc}" alt="${name}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:2px solid var(--accent-cyan);" />`;
    }
    if (imgEl) imgEl.src = story.media_url;
    if (captionEl) captionEl.textContent = story.caption || '';

    // Animate Progress Bar
    clearInterval(this.progressTimer);
    const activeFill = progressEl?.children[this.currentStoryIdx]?.querySelector('.story-progress-fill');
    let pct = 0;
    this.progressTimer = setInterval(() => {
      pct += 2;
      if (activeFill) activeFill.style.width = `${pct}%`;
      if (pct >= 100) {
        clearInterval(this.progressTimer);
        this.nextStory();
      }
    }, 100);
  }

  nextStory() {
    if (this.currentStoryIdx < this.stories.length - 1) {
      this.currentStoryIdx++;
      this.renderViewerSlide();
    } else {
      this.closeViewer();
    }
  }

  prevStory() {
    if (this.currentStoryIdx > 0) {
      this.currentStoryIdx--;
      this.renderViewerSlide();
    }
  }

  closeViewer() {
    clearInterval(this.progressTimer);
    if (this.modal) this.modal.hidden = true;
  }

  getMockStories() {
    return [
      {
        id: 's1',
        media_url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800&auto=format&fit=crop&q=80',
        caption: 'Night market lights in Shinjuku, Tokyo! 🏮✨',
        location_name: 'Tokyo, Japan',
        profiles: { username: 'Kenji_Travels', avatar_color: '#06b6d4' }
      },
      {
        id: 's2',
        media_url: 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800&auto=format&fit=crop&q=80',
        caption: 'Floating villas over azure turquoise waters 🏝️',
        location_name: 'Bora Bora, French Polynesia',
        profiles: { username: 'Elena_Globe', avatar_color: '#ec4899' }
      },
      {
        id: 's3',
        media_url: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&auto=format&fit=crop&q=80',
        caption: 'Sunset by the Eiffel Tower with French croissants 🥐🗼',
        location_name: 'Paris, France',
        profiles: { username: 'Jean_Pierre', avatar_color: '#f59e0b' }
      },
      {
        id: 's4',
        media_url: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&auto=format&fit=crop&q=80',
        caption: 'Burj Khalifa gleaming under the desert stars 🏙️💫',
        location_name: 'Dubai, UAE',
        profiles: { username: 'Tariq_Explorer', avatar_color: '#10b981' }
      }
    ];
  }
}

export const pulseStories = new PulseStories();
