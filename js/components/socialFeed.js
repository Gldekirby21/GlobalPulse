/**
 * Social Feed Component ("Pulse Feed")
 * Facebook-style travel news feed with Composer, Reactions, Real-time Comments,
 * Check-ins, and Photo Galleries.
 */

import { supabaseService } from '../services/supabaseService.js';
import { gamificationService } from '../services/gamificationService.js';
import { isAuthenticated, bindAuthTriggers } from '../utils/access.js';

class SocialFeed {
  constructor() {
    this.container = null;
    this.posts = [];
    this.activeFilter = 'all'; // 'all' | 'friends' | 'mine'
    this.channel = null;
    this.currentAttachedPhoto = null;
    this.currentTagLocation = null;
    this.currentFeeling = null;
    this.commentsCache = new Map(); // postId -> array of comments
  }

  init(containerId = 'feedStream') {
    this.container = document.getElementById(containerId);
    this.bindComposerEvents();
    this.bindFilterEvents();
    this.loadPosts();
  }

  /* --------------------------------------------------------------------------
     1. Event Listeners & Composer
     -------------------------------------------------------------------------- */
  bindComposerEvents() {
    const submitBtn = document.getElementById('composerSubmitBtn');
    const textarea = document.getElementById('composerTextarea');
    const photoBtn = document.getElementById('composerPhotoBtn');
    const photoInput = document.getElementById('composerPhotoInput');
    const checkinBtn = document.getElementById('composerCheckinBtn');
    const feelingBtn = document.getElementById('composerFeelingBtn');
    const removePhotoBtn = document.getElementById('composerRemovePhotoBtn');

    if (submitBtn && textarea) {
      submitBtn.addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text && !this.currentAttachedPhoto) {
          window.globalPulseApp?.showToast?.('Please write a story or attach a photo! ✍️', 'warning');
          return;
        }
        this.submitNewPost(text);
      });
    }

    if (photoBtn && photoInput) {
      photoBtn.addEventListener('click', () => photoInput.click());
      photoInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            this.currentAttachedPhoto = ev.target.result;
            this.renderComposerPreview();
          };
          reader.readAsDataURL(file);
        }
      });
    }

    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', () => {
        this.currentAttachedPhoto = null;
        if (photoInput) photoInput.value = '';
        this.renderComposerPreview();
      });
    }

    if (checkinBtn) {
      checkinBtn.addEventListener('click', () => {
        const userLoc = window.globalPulseApp?.userLocation;
        const defaultPlace = userLoc ? `${userLoc.city || ''}, ${userLoc.country || ''}` : 'Tokyo, Japan';
        const place = prompt('📍 Enter your travel destination / check-in location:', defaultPlace);
        if (place) {
          this.currentTagLocation = place.trim();
          this.renderComposerPreview();
        }
      });
    }

    if (feelingBtn) {
      feelingBtn.addEventListener('click', () => {
        const feelings = ['🎒 Adventurous', '🌴 Relaxed', '✈️ Flying', '🍜 Foodie Trip', '🏔️ Hiking', '📸 Sightseeing', '🔥 Excited'];
        const chosen = prompt(`Pick a feeling/activity (1-${feelings.length}):\n` + feelings.map((f, i) => `${i + 1}. ${f}`).join('\n'), '1');
        if (chosen && feelings[Number(chosen) - 1]) {
          this.currentFeeling = feelings[Number(chosen) - 1];
          this.renderComposerPreview();
        }
      });
    }
  }

  bindFilterEvents() {
    document.querySelectorAll('.feed-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.feed-filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeFilter = btn.dataset.feedFilter || 'all';
        this.renderPosts();
      });
    });
  }

  renderComposerPreview() {
    const previewWrap = document.getElementById('composerPhotoPreviewWrap');
    const previewImg = document.getElementById('composerPhotoPreview');
    const tagsWrap = document.getElementById('composerTagsPreview');

    if (previewWrap && previewImg) {
      previewWrap.hidden = !this.currentAttachedPhoto;
      if (this.currentAttachedPhoto) {
        previewImg.src = this.currentAttachedPhoto;
      }
    }

    if (tagsWrap) {
      let tagsHtml = '';
      if (this.currentTagLocation) {
        tagsHtml += `
          <span class="composer-tag-chip">
            <i class="fa-solid fa-location-dot"></i> at ${this.currentTagLocation}
            <button type="button" class="composer-tag-remove" data-remove-tag="loc">&times;</button>
          </span>`;
      }
      if (this.currentFeeling) {
        tagsHtml += `
          <span class="composer-tag-chip">
            ${this.currentFeeling}
            <button type="button" class="composer-tag-remove" data-remove-tag="feeling">&times;</button>
          </span>`;
      }
      tagsWrap.innerHTML = tagsHtml;

      tagsWrap.querySelectorAll('[data-remove-tag]').forEach((b) => {
        b.addEventListener('click', () => {
          if (b.dataset.removeTag === 'loc') this.currentTagLocation = null;
          if (b.dataset.removeTag === 'feeling') this.currentFeeling = null;
          this.renderComposerPreview();
        });
      });
    }
  }

  /* --------------------------------------------------------------------------
     2. Create, Edit & Delete Post
     -------------------------------------------------------------------------- */
  async submitNewPost(content) {
    if (!isAuthenticated()) {
      window.globalPulseApp?.showToast?.('Please sign in to share your travel stories! 🔒', 'info');
      window.globalPulseApp?.authModal?.open('signin');
      return;
    }

    const me = supabaseService.user.id;
    const postPayload = {
      user_id: me,
      content,
      image_url: this.currentAttachedPhoto || null,
      location_name: this.currentTagLocation || null,
      feeling_activity: this.currentFeeling || null
    };

    // Optimistic post insertion
    const tempPost = {
      id: `temp_${Date.now()}`,
      ...postPayload,
      created_at: new Date().toISOString(),
      profiles: supabaseService.profile || { username: 'Explorer', avatar_color: '#06b6d4' },
      post_reactions: [],
      post_comments: []
    };
    this.posts.unshift(tempPost);
    this.renderPosts();

    // Reset composer form
    const textarea = document.getElementById('composerTextarea');
    if (textarea) textarea.value = '';
    this.currentAttachedPhoto = null;
    this.currentTagLocation = null;
    this.currentFeeling = null;
    this.renderComposerPreview();

    // Ensure profile row exists in database before inserting post
    if (!supabaseService.profile && supabaseService.user) {
      supabaseService.profile = await supabaseService.ensureProfile(supabaseService.user);
    }

    const { data, error } = await supabaseService.client
      .from('posts')
      .insert(postPayload)
      .select('*, profiles(id, username, full_name, avatar_url, avatar_color)')
      .maybeSingle();

    if (error) {
      console.error('❌ Post creation error from Supabase:', error.message, error);
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        window.globalPulseApp?.showToast?.('Please run MASTER_SCHEMA.sql in Supabase SQL editor! ⚠️', 'warning');
      } else {
        window.globalPulseApp?.showToast?.(`Could not save post to cloud: ${error.message}`, 'warning');
      }
      return;
    }

    if (data) {
      const idx = this.posts.findIndex((p) => p.id === tempPost.id);
      if (idx !== -1) {
        this.posts[idx] = { ...data, post_reactions: [], post_comments: [] };
        this.renderPosts();
      }
      gamificationService.grantBadge('explorer');
      window.globalPulseApp?.showToast?.('Post published to GlobalPulse! 🌟', 'success');
    }
  }

  async deletePost(postId) {
    if (!confirm('Are you sure you want to delete this travel post?')) return;
    this.posts = this.posts.filter((p) => p.id !== postId);
    this.renderPosts();

    if (!postId.startsWith('temp_') && !postId.startsWith('mock_')) {
      await supabaseService.client.from('posts').delete().eq('id', postId);
    }
    window.globalPulseApp?.showToast?.('Post deleted 🗑️', 'info');
  }

  /* --------------------------------------------------------------------------
     3. Fetch & Render Posts
     -------------------------------------------------------------------------- */
  async loadPosts() {
    let postsData = [];
    if (supabaseService.configured) {
      try {
        const { data, error } = await supabaseService.client
          .from('posts')
          .select(`
            id, user_id, content, image_url, location_name, location_cca3, feeling_activity, created_at,
            profiles (id, username, full_name, avatar_url, avatar_color, travel_style),
            post_reactions (id, user_id, reaction_type),
            post_comments (id, user_id, comment_text, created_at)
          `)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          console.warn('Primary posts query failed, trying simple select:', error.message);
          const simple = await supabaseService.client
            .from('posts')
            .select('*, profiles(id, username, full_name, avatar_url, avatar_color)')
            .order('created_at', { ascending: false })
            .limit(50);
          if (simple.data && simple.data.length) {
            postsData = simple.data;
          }
        } else if (data && data.length) {
          postsData = data;
        }
      } catch (err) {
        console.error('loadPosts exception:', err);
      }
    }

    // Fallback demo inspiring posts if empty
    if (!postsData.length) {
      postsData = this.getMockPosts();
    }

    this.posts = postsData;
    this.renderPosts();
    this.subscribe();
  }

  renderPosts() {
    if (!this.container) return;

    let list = this.posts;
    const me = supabaseService.user?.id;

    if (this.activeFilter === 'mine') {
      list = list.filter((p) => p.user_id === me);
    } else if (this.activeFilter === 'friends') {
      const friendIds = window.globalPulseApp?.chatPanel?.getFriendIds?.() || [];
      list = list.filter((p) => p.user_id === me || friendIds.includes(p.user_id));
    }

    if (!list.length) {
      this.container.innerHTML = `
        <div class="msg-empty-notice">
          <i class="fa-solid fa-newspaper"></i>
          <h4>No posts found</h4>
          <p>Be the first explorer to share a travel photo or story with the community!</p>
        </div>`;
      return;
    }

    this.container.innerHTML = list.map((post) => this.renderPostCard(post)).join('');
    this.bindPostInteractions();
  }

  renderPostCard(post) {
    const me = supabaseService.user?.id;
    const p = post.profiles || {};
    const authorName = p.full_name || p.username || 'Explorer';
    const isOwner = me && post.user_id === me;
    const timeAgo = this.timeAgo(post.created_at);

    // Reactions summary
    const reactions = post.post_reactions || [];
    const myReaction = me ? reactions.find((r) => r.user_id === me) : null;
    const reactionCounts = {
      like: reactions.filter((r) => r.reaction_type === 'like').length,
      love: reactions.filter((r) => r.reaction_type === 'love').length,
      fire: reactions.filter((r) => r.reaction_type === 'fire').length,
      wanderlust: reactions.filter((r) => r.reaction_type === 'wanderlust').length,
      wow: reactions.filter((r) => r.reaction_type === 'wow').length
    };
    const totalReactions = reactions.length;

    const avatarHtml = p.avatar_url
      ? `<img src="${p.avatar_url}" alt="${authorName}" class="post-avatar" />`
      : `<span class="avatar-dot post-avatar" style="--avatar:${p.avatar_color || '#06b6d4'}; width:44px; height:44px; font-size:1.1rem;">
           ${authorName.charAt(0).toUpperCase()}
         </span>`;

    const comments = post.post_comments || [];

    return `
      <article class="feed-post-card" data-post-id="${post.id}">
        <!-- Post Header -->
        <header class="post-header">
          <div class="post-avatar-wrap" data-user-profile="${post.user_id}">
            ${avatarHtml}
          </div>
          <div class="post-author-meta">
            <div class="post-author-name-row">
              <span class="post-author-name" data-user-profile="${post.user_id}">${authorName}</span>
              ${post.feeling_activity ? `<span class="post-feeling-tag">is ${post.feeling_activity}</span>` : ''}
              ${post.location_name ? `<span class="post-location-tag"><i class="fa-solid fa-location-dot"></i> at <strong>${post.location_name}</strong></span>` : ''}
            </div>
            <div class="post-time-row">
              <span>${timeAgo}</span> &bull; <i class="fa-solid fa-earth-americas" title="Public Explorer Post"></i>
            </div>
          </div>
          ${isOwner ? `
            <button type="button" class="post-menu-btn" data-delete-post="${post.id}" title="Delete Post">
              <i class="fa-solid fa-trash"></i>
            </button>` : ''}
        </header>

        <!-- Post Content Body -->
        <div class="post-content-body">${this.escapeHtml(post.content)}</div>

        <!-- Post Image (if attached) -->
        ${post.image_url ? `
          <div class="post-image-container">
            <img src="${post.image_url}" alt="Travel Photo" class="post-image" loading="lazy" />
          </div>` : ''}

        <!-- Post Stats Bar (Reactions & Comments count) -->
        <div class="post-stats-bar">
          <div class="post-reactions-count">
            ${totalReactions > 0 ? `
              <span class="reaction-icons-stack">
                ${reactionCounts.love > 0 ? '❤️' : ''}${reactionCounts.fire > 0 ? '🔥' : ''}${reactionCounts.like > 0 ? '👍' : ''}${reactionCounts.wanderlust > 0 ? '✈️' : ''}
              </span>
              <span>${totalReactions}</span>` : '<span>Be the first to react</span>'}
          </div>
          <div class="post-comments-count">
            ${comments.length} comment${comments.length !== 1 ? 's' : ''}
          </div>
        </div>

        <!-- Post Actions Bar (Reaction hover popup & Comment toggle) -->
        <div class="post-actions-bar">
          <div class="react-btn-wrap" style="flex:1; position:relative;">
            <button type="button" class="post-action-btn ${myReaction ? 'active' : ''}" data-react-toggle="${post.id}">
              <i class="fa-regular fa-thumbs-up"></i>
              <span>${myReaction ? this.reactionLabel(myReaction.reaction_type) : 'React'}</span>
            </button>
            <div class="react-popup-bar" hidden>
              <button type="button" class="react-emoji-btn" data-react-type="like" title="Like">👍</button>
              <button type="button" class="react-emoji-btn" data-react-type="love" title="Love">❤️</button>
              <button type="button" class="react-emoji-btn" data-react-type="fire" title="Fire">🔥</button>
              <button type="button" class="react-emoji-btn" data-react-type="wanderlust" title="Wanderlust">✈️</button>
              <button type="button" class="react-emoji-btn" data-react-type="wow" title="Wow">😮</button>
            </div>
          </div>

          <button type="button" class="post-action-btn" data-toggle-comments="${post.id}">
            <i class="fa-regular fa-comment"></i>
            <span>Comment</span>
          </button>

          <button type="button" class="post-action-btn" data-share-post="${post.id}">
            <i class="fa-solid fa-share"></i>
            <span>Share</span>
          </button>
        </div>

        <!-- Threaded Comments Section -->
        <section class="post-comments-section" id="commentsSection_${post.id}">
          <div class="comments-list" id="commentsList_${post.id}">
            ${comments.map((c) => this.renderCommentItem(c)).join('')}
          </div>
          <form class="comment-input-form" data-comment-form="${post.id}">
            <input type="text" placeholder="Write a comment..." maxlength="500" autocomplete="off" />
            <button type="submit" class="comment-submit-btn" aria-label="Send comment"><i class="fa-solid fa-paper-plane"></i></button>
          </form>
        </section>
      </article>
    `;
  }

  renderCommentItem(c) {
    const prof = c.profiles || {};
    const name = prof.username || 'Explorer';
    const color = prof.avatar_color || '#06b6d4';
    const avatarHtml = prof.avatar_url
      ? `<img src="${prof.avatar_url}" alt="${name}" class="comment-avatar" />`
      : `<span class="avatar-dot comment-avatar" style="--avatar:${color}; width:32px; height:32px; font-size:0.8rem;">
           ${name.charAt(0).toUpperCase()}
         </span>`;

    return `
      <div class="comment-item">
        ${avatarHtml}
        <div class="comment-bubble">
          <strong>${name}</strong>
          <span>${this.escapeHtml(c.comment_text)}</span>
        </div>
      </div>`;
  }

  bindPostInteractions() {
    // Delete Post
    this.container.querySelectorAll('[data-delete-post]').forEach((btn) => {
      btn.addEventListener('click', () => this.deletePost(btn.dataset.deletePost));
    });

    // Reaction Hover & Emoji Clicks
    this.container.querySelectorAll('.react-btn-wrap').forEach((wrap) => {
      const btn = wrap.querySelector('[data-react-toggle]');
      const popup = wrap.querySelector('.react-popup-bar');
      const postId = btn?.dataset.reactToggle;

      if (btn && popup) {
        wrap.addEventListener('mouseenter', () => { popup.hidden = false; });
        wrap.addEventListener('mouseleave', () => { popup.hidden = true; });

        popup.querySelectorAll('.react-emoji-btn').forEach((emojiBtn) => {
          emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            popup.hidden = true;
            this.handleReaction(postId, emojiBtn.dataset.reactType);
          });
        });
      }
    });

    // Comment Form Submission
    this.container.querySelectorAll('[data-comment-form]').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const postId = form.dataset.commentForm;
        const input = form.querySelector('input');
        const text = input?.value.trim();
        if (text) {
          this.submitComment(postId, text);
          if (input) input.value = '';
        }
      });
    });

    // Share Post
    this.container.querySelectorAll('[data-share-post]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (navigator.share) {
          navigator.share({
            title: 'GlobalPulse Travel Feed',
            text: 'Check out this travel post on GlobalPulse!',
            url: window.location.href
          }).catch(() => {});
        } else {
          navigator.clipboard.writeText(window.location.href);
          window.globalPulseApp?.showToast?.('Link copied to clipboard! 📋', 'info');
        }
      });
    });

    // Profile Click trigger
    this.container.querySelectorAll('[data-user-profile]').forEach((el) => {
      el.addEventListener('click', () => {
        const uid = el.dataset.userProfile;
        if (uid && window.globalPulseApp?.passport) {
          window.globalPulseApp.passport.openProfileCard(uid);
        }
      });
    });
  }

  /* --------------------------------------------------------------------------
     4. Reactions & Comments Handler
     -------------------------------------------------------------------------- */
  async handleReaction(postId, reactionType) {
    if (!isAuthenticated()) {
      window.globalPulseApp?.showToast?.('Please sign in to react! ❤️', 'info');
      window.globalPulseApp?.authModal?.open('signin');
      return;
    }

    const me = supabaseService.user.id;
    const post = this.posts.find((p) => p.id === postId);
    if (!post) return;

    if (!post.post_reactions) post.post_reactions = [];
    const existingIdx = post.post_reactions.findIndex((r) => r.user_id === me);

    if (existingIdx !== -1) {
      if (post.post_reactions[existingIdx].reaction_type === reactionType) {
        // Remove reaction
        post.post_reactions.splice(existingIdx, 1);
        await supabaseService.client.from('post_reactions').delete().eq('post_id', postId).eq('user_id', me);
      } else {
        // Change reaction
        post.post_reactions[existingIdx].reaction_type = reactionType;
        await supabaseService.client.from('post_reactions').upsert({ post_id: postId, user_id: me, reaction_type: reactionType });
      }
    } else {
      // Add reaction
      post.post_reactions.push({ user_id: me, reaction_type: reactionType });
      await supabaseService.client.from('post_reactions').insert({ post_id: postId, user_id: me, reaction_type: reactionType });
    }

    this.renderPosts();
  }

  async submitComment(postId, commentText) {
    if (!isAuthenticated()) {
      window.globalPulseApp?.showToast?.('Please sign in to comment! 💬', 'info');
      window.globalPulseApp?.authModal?.open('signin');
      return;
    }

    const me = supabaseService.user.id;
    const post = this.posts.find((p) => p.id === postId);
    if (!post) return;

    const newComment = {
      id: `temp_c_${Date.now()}`,
      post_id: postId,
      user_id: me,
      comment_text: commentText,
      created_at: new Date().toISOString(),
      profiles: supabaseService.profile || { username: 'Explorer', avatar_color: '#06b6d4' }
    };

    if (!post.post_comments) post.post_comments = [];
    post.post_comments.push(newComment);

    const listEl = document.getElementById(`commentsList_${postId}`);
    if (listEl) {
      listEl.insertAdjacentHTML('beforeend', this.renderCommentItem(newComment));
    }

    await supabaseService.client.from('post_comments').insert({
      post_id: postId,
      user_id: me,
      comment_text: commentText
    });
  }

  /* --------------------------------------------------------------------------
     5. Realtime Sync
     -------------------------------------------------------------------------- */
  subscribe() {
    if (!supabaseService.configured || this.channel) return;

    this.channel = supabaseService.client
      .channel('globalpulse-social-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
        const { data: newP } = await supabaseService.client
          .from('posts')
          .select('*, profiles(*)')
          .eq('id', payload.new.id)
          .maybeSingle();

        if (newP && !this.posts.some((p) => p.id === newP.id)) {
          this.posts.unshift({ ...newP, post_reactions: [], post_comments: [] });
          this.renderPosts();
        }
      })
      .subscribe();
  }

  /* --------------------------------------------------------------------------
     6. Mock Posts Demo
     -------------------------------------------------------------------------- */
  getMockPosts() {
    return [
      {
        id: 'mock_1',
        user_id: 'mock_u1',
        content: 'Watching the sunrise over Mount Fuji in Yamanashi, Japan! The view was utterly breathtaking. Highly recommend climbing the trail early in the morning! 🗻🌅',
        image_url: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=900&auto=format&fit=crop&q=80',
        location_name: 'Mount Fuji, Japan',
        feeling_activity: '🏔️ Hiking',
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        profiles: { username: 'Aoi_Travels', full_name: 'Aoi Tanaka', avatar_color: '#ec4899', avatar_url: '' },
        post_reactions: [{ reaction_type: 'love' }, { reaction_type: 'fire' }, { reaction_type: 'wanderlust' }],
        post_comments: [
          { profiles: { username: 'Kirby' }, comment_text: 'Incredible view! Anong hotel malapit diyan?' }
        ]
      },
      {
        id: 'mock_2',
        user_id: 'mock_u2',
        content: 'White beach crystal waters here in Boracay Island, Philippines! The tropical breeze and sunset sailing are pure paradise. 🌴⛵🍹',
        image_url: 'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?w=900&auto=format&fit=crop&q=80',
        location_name: 'Boracay, Philippines',
        feeling_activity: '🌴 Relaxed',
        created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
        profiles: { username: 'MarcoPolo_PH', full_name: 'Marco Rivera', avatar_color: '#06b6d4', avatar_url: '' },
        post_reactions: [{ reaction_type: 'like' }, { reaction_type: 'love' }, { reaction_type: 'fire' }],
        post_comments: []
      }
    ];
  }

  /* --------------------------------------------------------------------------
     7. Helpers
     -------------------------------------------------------------------------- */
  reactionLabel(type) {
    const map = { like: '👍 Liked', love: '❤️ Loved', fire: '🔥 Fire', wanderlust: '✈️ Travel', wow: '😮 Wow' };
    return map[type] || 'React';
  }

  timeAgo(isoStr) {
    if (!isoStr) return 'just now';
    const seconds = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  escapeHtml(str = '') {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

export const socialFeed = new SocialFeed();
