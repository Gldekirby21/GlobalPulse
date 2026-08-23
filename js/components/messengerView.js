/**
 * Messenger View — Desktop & Browser Style Explorer Chat
 * Features 3-Panel Layout, Sub-Tabs (Chats, Explorers, Requests), Search,
 * Real-time deduplicated messaging, Location Sharing, and Profile Sidebar.
 */

import { supabaseService } from '../services/supabaseService.js';
import { gamificationService, BADGES as gamificationBadges } from '../services/gamificationService.js';
import { passport } from './passport.js';
import { isAuthenticated, lockOverlayHtml, bindAuthTriggers } from '../utils/access.js';

class MessengerView {
  constructor() {
    this.activeTab = 'chats'; // 'chats' | 'explorers' | 'requests'
    this.activePeer = null;   // Full profile object of current chat partner
    this.activePeerStats = null;
    this.conversations = [];
    this.unreadByPeer = new Map(); // peerId -> count
    this.friends = new Map();      // userId -> {username, avatar_url, avatar_color}
    this.requests = [];            // incoming requester IDs
    this.outgoing = new Set();     // outgoing requested IDs
    this.channel = null;
    this.searchQuery = '';
    this.communityUsers = [];
    this.isInfoOpen = true;
  }

  init() {
    this.bindEvents();
    this.subscribeGlobalTriggers();
  }

  /* --------------------------------------------------------------------------
     1. Event Listeners & Tab Navigation
     -------------------------------------------------------------------------- */
  bindEvents() {
    // Sub-Tabs switching (Chats / Explorers / Requests)
    document.querySelectorAll('.msg-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.msgTab;
        this.switchSubTab(tab);
      });
    });

    // Search input
    const searchInput = document.getElementById('msgSearchInput');
    const searchClear = document.getElementById('msgSearchClear');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        if (searchClear) searchClear.hidden = !this.searchQuery;
        this.renderCurrentSubTab();
      });
    }

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          this.searchQuery = '';
          searchClear.hidden = true;
          this.renderCurrentSubTab();
        }
      });
    }

    // Chat Message Form Submission
    const form = document.getElementById('msgForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('msgInput');
        const body = input?.value.trim();
        if (body) {
          this.send(body);
          if (input) input.value = '';
        }
      });
    }

    // Quick Emojis
    document.querySelectorAll('.msg-emoji-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        const input = document.getElementById('msgInput');
        if (input) {
          input.value += emoji;
          input.focus();
        }
      });
    });

    // Share Location Button
    const shareLocBtn = document.getElementById('msgShareLocationBtn');
    if (shareLocBtn) {
      shareLocBtn.addEventListener('click', () => {
        this.shareMyLocation();
      });
    }

    // Mobile Back Button
    const backBtn = document.getElementById('msgBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.closeThreadMobile();
      });
    }

    // Toggle Right Info Panel
    const toggleInfoBtn = document.getElementById('msgToggleInfoBtn');
    const closeInfoBtn = document.getElementById('msgInfoClose');
    if (toggleInfoBtn) {
      toggleInfoBtn.addEventListener('click', () => {
        this.toggleInfoPanel();
      });
    }
    if (closeInfoBtn) {
      closeInfoBtn.addEventListener('click', () => {
        this.toggleInfoPanel(false);
      });
    }

    // Header Action Buttons (Profile & Map)
    const actionProfile = document.getElementById('msgActionProfile');
    if (actionProfile) {
      actionProfile.addEventListener('click', () => {
        if (this.activePeer?.id) {
          if (window.globalPulseApp?.profileManager) {
            window.globalPulseApp.profileManager.openProfileModal(this.activePeer.id);
          } else {
            passport.openProfileCard(this.activePeer.id);
          }
        }
      });
    }

    const actionMap = document.getElementById('msgActionMap');
    if (actionMap) {
      actionMap.addEventListener('click', () => {
        if (this.activePeer) {
          // Switch to map and locate if coords known
          window.globalPulseApp?.switchTab('map');
          const cu = this.communityUsers.find((u) => u.user_id === this.activePeer.id);
          if (cu && Number.isFinite(cu.lat) && Number.isFinite(cu.lon)) {
            window.globalPulseApp?.mapManager?.setSearchLocation?.(cu.lat, cu.lon, cu.city || this.activePeer.username);
          }
        }
      });
    }
  }

  subscribeGlobalTriggers() {
    // Delegated actions for opening chat from anywhere in the app
    document.addEventListener('click', (e) => {
      const chatBtn = e.target.closest('[data-chat-user]');
      if (chatBtn) {
        const uid = chatBtn.dataset.chatUser;
        if (uid) {
          this.openWith(uid);
        }
      }
    });

    // Listen to community location feeds from app.js
    document.addEventListener('globalpulse:communityfeed', (e) => {
      this.communityUsers = e.detail?.users || [];
      if (this.activeTab === 'explorers') {
        this.renderExplorersList();
      }
    });
  }

  /* --------------------------------------------------------------------------
     2. Sub-Tabs & View Management
     -------------------------------------------------------------------------- */
  switchSubTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.msg-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.msgTab === tab);
    });

    document.querySelectorAll('.msg-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.id === `msgPane${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    });

    this.renderCurrentSubTab();
  }

  renderCurrentSubTab() {
    if (this.activeTab === 'chats') {
      this.renderConversationList();
    } else if (this.activeTab === 'explorers') {
      this.renderExplorersList();
    } else if (this.activeTab === 'requests') {
      this.renderRequestsList();
    }
  }

  toggleInfoPanel(forceState = null) {
    const panel = document.getElementById('msgInfoPanel');
    if (!panel) return;
    this.isInfoOpen = forceState !== null ? forceState : !this.isInfoOpen;
    panel.classList.toggle('open', this.isInfoOpen);
    panel.classList.toggle('collapsed', !this.isInfoOpen);
  }

  closeThreadMobile() {
    this.activePeer = null;
    const threadLayout = document.getElementById('msgThreadLayout');
    const emptyState = document.getElementById('msgEmptyState');
    const sidebar = document.querySelector('.msg-sidebar');

    if (threadLayout) threadLayout.hidden = true;
    if (emptyState) emptyState.hidden = false;
    if (sidebar) sidebar.classList.remove('mobile-hidden');
  }

  /* --------------------------------------------------------------------------
     3. Session Management & Guest Teaser
     -------------------------------------------------------------------------- */
  setSession(session) {
    const container = document.getElementById('messengerContainer');
    if (!container) return;

    if (!session || !session.user) {
      this.unsubscribe();
      this.friends.clear();
      this.requests = [];
      this.outgoing.clear();
      this.unreadByPeer.clear();
      this.activePeer = null;
      this.updateUnreadBadges();

      // Render Locked Guest Overlay
      container.innerHTML = `
        <div class="msg-locked-view">
          <div class="msg-locked-content">
            <div class="msg-locked-icon"><i class="fa-solid fa-comments"></i></div>
            <h2>GlobalPulse Messenger</h2>
            <p>Connect and direct-message fellow travelers, coordinate meetups, and share real-time locations with explorers worldwide.</p>
            <div class="msg-locked-features">
              <div class="msg-feat-item"><i class="fa-solid fa-bolt"></i> Real-time direct messaging</div>
              <div class="msg-feat-item"><i class="fa-solid fa-location-dot"></i> 1-Click live location sharing</div>
              <div class="msg-feat-item"><i class="fa-solid fa-user-plus"></i> Explorer friendships & badges</div>
            </div>
            <button type="button" class="btn-primary btn-lg" data-open-auth="signin">
              <i class="fa-solid fa-right-to-bracket"></i> Sign In to Access Messenger
            </button>
          </div>
        </div>
      `;
      bindAuthTriggers(container);
    } else {
      // Re-render messenger structure if it was replaced by guest overlay
      if (container.querySelector('.msg-locked-view')) {
        this.restoreContainerHtml();
        this.bindEvents();
      }

      this.subscribe();
      this.loadFriends();
      this.loadConversations().then(() => {
        this.renderConversationList();
        this.updateUnreadBadges();
      });
    }
  }

  restoreContainerHtml() {
    const container = document.getElementById('messengerContainer');
    if (!container) return;
    container.innerHTML = `
      <aside class="msg-sidebar">
        <div class="msg-sidebar-header">
          <div class="msg-search-box">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="msgSearchInput" placeholder="Search conversations & explorers..." autocomplete="off" />
            <button type="button" class="msg-search-clear" id="msgSearchClear" hidden><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="msg-nav-tabs" role="tablist">
            <button type="button" class="msg-tab-btn active" data-msg-tab="chats" id="msgTabChats">
              <i class="fa-solid fa-message"></i> <span>Chats</span>
              <span class="msg-badge-dot" id="msgChatsBadge" hidden></span>
            </button>
            <button type="button" class="msg-tab-btn" data-msg-tab="explorers" id="msgTabExplorers">
              <i class="fa-solid fa-earth-americas"></i> <span>Explorers</span>
            </button>
            <button type="button" class="msg-tab-btn" data-msg-tab="requests" id="msgTabRequests">
              <i class="fa-solid fa-user-group"></i> <span>Requests</span>
              <span class="msg-badge-count" id="msgRequestsBadge" hidden>0</span>
            </button>
          </div>
        </div>
        <div class="msg-sidebar-content">
          <div class="msg-pane active" id="msgPaneChats">
            <div class="msg-convo-list" id="msgConvoList"></div>
          </div>
          <div class="msg-pane" id="msgPaneExplorers">
            <div class="msg-explorers-list" id="msgExplorersList"></div>
          </div>
          <div class="msg-pane" id="msgPaneRequests">
            <div class="msg-requests-list" id="msgRequestsList"></div>
          </div>
        </div>
      </aside>
      <main class="msg-main-chat" id="msgMainChat">
        <div class="msg-empty-state" id="msgEmptyState">
          <div class="msg-empty-icon"><i class="fa-solid fa-paper-plane"></i></div>
          <h3>Select an Explorer to Start Chatting</h3>
          <p>Pick a conversation from the left sidebar, or connect with live explorers from the community map.</p>
        </div>
        <div class="msg-thread-layout" id="msgThreadLayout" hidden>
          <header class="msg-thread-header">
            <button type="button" class="msg-back-btn" id="msgBackBtn"><i class="fa-solid fa-arrow-left"></i></button>
            <div class="msg-peer-avatar-wrap" id="msgPeerAvatarWrap"></div>
            <div class="msg-peer-info">
              <div class="msg-peer-name-row">
                <h3 id="msgPeerName">Explorer</h3>
                <span class="msg-peer-style-badge" id="msgPeerStyleBadge" hidden></span>
              </div>
              <div class="msg-peer-status" id="msgPeerStatus"><span class="online-indicator"></span> <span>Active Explorer</span></div>
            </div>
            <div class="msg-thread-actions">
              <button type="button" class="msg-action-btn" id="msgActionProfile" title="View Explorer Profile"><i class="fa-solid fa-id-card"></i> <span>Profile</span></button>
              <button type="button" class="msg-action-btn" id="msgActionMap" title="Locate on Map"><i class="fa-solid fa-map-location-dot"></i> <span>Map</span></button>
              <button type="button" class="msg-action-btn" id="msgToggleInfoBtn" title="Toggle Info Sidebar"><i class="fa-solid fa-circle-info"></i></button>
            </div>
          </header>
          <div class="msg-stream" id="msgStream"></div>
          <footer class="msg-composer-bar">
            <div class="msg-quick-tools">
              <button type="button" class="msg-tool-btn" id="msgShareLocationBtn"><i class="fa-solid fa-location-dot"></i> <span>Share Location</span></button>
              <div class="msg-quick-emojis">
                <button type="button" class="msg-emoji-btn" data-emoji="👋">👋</button>
                <button type="button" class="msg-emoji-btn" data-emoji="🌍">🌍</button>
                <button type="button" class="msg-emoji-btn" data-emoji="✈️">✈️</button>
                <button type="button" class="msg-emoji-btn" data-emoji="🔥">🔥</button>
                <button type="button" class="msg-emoji-btn" data-emoji="❤️">❤️</button>
              </div>
            </div>
            <form class="msg-input-form" id="msgForm">
              <input type="text" id="msgInput" placeholder="Type a message... (Press Enter to send)" maxlength="500" autocomplete="off" />
              <button type="submit" class="msg-send-btn" id="msgSendBtn"><i class="fa-solid fa-paper-plane"></i></button>
            </form>
          </footer>
        </div>
      </main>
      <aside class="msg-info-panel" id="msgInfoPanel">
        <div class="msg-info-header">
          <h4>Explorer Profile</h4>
          <button type="button" class="msg-info-close" id="msgInfoClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="msg-info-body" id="msgInfoBody">
          <p class="community-empty">Select a conversation to view explorer details.</p>
        </div>
      </aside>
    `;
  }

  /* --------------------------------------------------------------------------
     4. Data Fetching & Conversations
     -------------------------------------------------------------------------- */
  async loadConversations() {
    if (!supabaseService.user) return [];
    const me = supabaseService.user.id;

    const { data, error } = await supabaseService.client
      .from('messages')
      .select('id, sender_id, recipient_id, body, read, created_at')
      .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) {
      console.warn('Conversations fetch error:', error.message);
      return [];
    }

    const convos = new Map();
    this.unreadByPeer.clear();

    (data || []).forEach((m) => {
      const peerId = m.sender_id === me ? m.recipient_id : m.sender_id;
      if (!convos.has(peerId)) {
        convos.set(peerId, { peerId, last: m });
      }
      if (m.recipient_id === me && !m.read) {
        this.unreadByPeer.set(peerId, (this.unreadByPeer.get(peerId) || 0) + 1);
      }
    });

    const list = [...convos.values()];
    const peerIds = list.map((c) => c.peerId);

    if (peerIds.length) {
      const { data: profs } = await supabaseService.client
        .from('profiles')
        .select('id, username, full_name, avatar_url, avatar_color, travel_style, home_country, home_city, xp')
        .in('id', peerIds);

      const profMap = new Map((profs || []).map((p) => [p.id, p]));
      list.forEach((c) => {
        c.profile = profMap.get(c.peerId) || { id: c.peerId, username: 'Explorer' };
      });
    }

    this.conversations = list;
    return list;
  }

  async loadFriends() {
    if (!supabaseService.user) return;
    const me = supabaseService.user.id;

    const { data, error } = await supabaseService.client
      .from('friendships')
      .select('requester_id, addressee_id, status')
      .or(`requester_id.eq.${me},addressee_id.eq.${me}`);

    if (error) return;

    this.friends.clear();
    this.requests = [];
    this.outgoing.clear();

    const ids = new Set();
    (data || []).forEach((f) => {
      const other = f.requester_id === me ? f.addressee_id : f.requester_id;
      if (f.status === 'accepted') {
        ids.add(other);
      } else if (f.status === 'pending') {
        if (f.addressee_id === me) this.requests.push(f.requester_id);
        else this.outgoing.add(other);
      }
    });

    if (ids.size) {
      const { data: profs } = await supabaseService.client
        .from('profiles')
        .select('id, username, full_name, avatar_url, avatar_color, travel_style, home_country, home_city')
        .in('id', [...ids]);

      (profs || []).forEach((p) => {
        this.friends.set(p.id, p);
      });
    }

    this.renderRequestsBadge();
  }

  /* --------------------------------------------------------------------------
     5. Renders: Conversation List, Explorers & Requests
     -------------------------------------------------------------------------- */
  renderConversationList() {
    const box = document.getElementById('msgConvoList');
    if (!box) return;

    let list = this.conversations;
    if (this.searchQuery) {
      list = list.filter((c) => {
        const u = (c.profile?.username || '').toLowerCase();
        const fn = (c.profile?.full_name || '').toLowerCase();
        const b = (c.last?.body || '').toLowerCase();
        return u.includes(this.searchQuery) || fn.includes(this.searchQuery) || b.includes(this.searchQuery);
      });
    }

    if (!list.length) {
      box.innerHTML = `
        <div class="msg-empty-notice">
          <i class="fa-solid fa-comments"></i>
          <h4>${this.searchQuery ? 'No matching chats found' : 'No conversations yet'}</h4>
          <p>${this.searchQuery ? 'Try searching for another name' : 'Explore the live map and start a chat with other travelers!'}</p>
        </div>
      `;
      return;
    }

    box.innerHTML = list.map(({ peerId, last, profile }) => {
      const p = profile || {};
      const name = p.full_name || p.username || 'Explorer';
      const unread = this.unreadByPeer.get(peerId) || 0;
      const isActive = this.activePeer?.id === peerId;
      const time = this.formatTime(last.created_at);

      const avatarHtml = p.avatar_url
        ? `<img src="${p.avatar_url}" alt="${name}" class="msg-convo-avatar" />`
        : `<span class="avatar-dot msg-convo-avatar" style="--avatar:${p.avatar_color || '#06b6d4'};">
             ${(p.username || name).charAt(0).toUpperCase()}
           </span>`;

      return `
        <div class="msg-convo-item ${isActive ? 'active' : ''} ${unread > 0 ? 'unread' : ''}" data-peer-id="${peerId}">
          <div class="msg-convo-avatar-wrap">
            ${avatarHtml}
            <span class="online-indicator"></span>
          </div>
          <div class="msg-convo-main">
            <div class="msg-convo-top">
              <span class="msg-convo-name">${name}</span>
              <span class="msg-convo-time">${time}</span>
            </div>
            <div class="msg-convo-bottom">
              <span class="msg-convo-snippet">${this.escapeHtml(last.body)}</span>
              ${unread > 0 ? `<span class="msg-unread-pill">${unread}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    box.querySelectorAll('.msg-convo-item').forEach((item) => {
      item.addEventListener('click', () => {
        this.openWith(item.dataset.peerId);
      });
    });
  }

  renderExplorersList() {
    const box = document.getElementById('msgExplorersList');
    if (!box) return;

    let users = this.communityUsers;
    const me = supabaseService.user?.id;
    if (me) {
      users = users.filter((u) => u.user_id !== me);
    }

    if (this.searchQuery) {
      users = users.filter((u) => {
        const un = (u.profiles?.username || '').toLowerCase();
        const loc = (u.city || u.country || '').toLowerCase();
        return un.includes(this.searchQuery) || loc.includes(this.searchQuery);
      });
    }

    if (!users.length) {
      box.innerHTML = `
        <div class="msg-empty-notice">
          <i class="fa-solid fa-earth-asia"></i>
          <h4>No online explorers detected</h4>
          <p>Explorers active on the global map will appear here in real time.</p>
        </div>
      `;
      return;
    }

    box.innerHTML = users.map((u) => {
      const name = u.profiles?.username || 'Explorer';
      const color = u.profiles?.avatar_color || '#06b6d4';
      const loc = u.city ? `${u.city}, ${u.country || ''}` : u.country || 'Global Explorer';
      const isFriend = this.friends.has(u.user_id);
      const isPending = this.outgoing.has(u.user_id);

      return `
        <div class="msg-explorer-card" data-user-id="${u.user_id}">
          <div class="msg-convo-avatar-wrap">
            <span class="avatar-dot msg-convo-avatar" style="--avatar:${color};">
              ${name.charAt(0).toUpperCase()}
            </span>
            <span class="online-indicator pulse"></span>
          </div>
          <div class="msg-explorer-info">
            <strong>${name}</strong>
            <small><i class="fa-solid fa-location-dot"></i> ${loc}</small>
          </div>
          <div class="msg-explorer-actions">
            <button type="button" class="btn-primary btn-sm" data-msg-start="${u.user_id}" title="Send Message">
              <i class="fa-solid fa-comment"></i>
            </button>
            ${!isFriend && !isPending ? `
              <button type="button" class="btn-secondary btn-sm" data-msg-add="${u.user_id}" title="Add Friend">
                <i class="fa-solid fa-user-plus"></i>
              </button>` : isPending ? `
              <button type="button" class="btn-secondary btn-sm" disabled title="Request Sent">
                <i class="fa-solid fa-clock"></i>
              </button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    box.querySelectorAll('[data-msg-start]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openWith(btn.dataset.msgStart);
      });
    });

    box.querySelectorAll('[data-msg-add]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const uid = btn.dataset.msgAdd;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-clock"></i>';
        await supabaseService.client.from('friendships').insert({
          requester_id: supabaseService.user.id,
          addressee_id: uid
        });
        this.outgoing.add(uid);
      });
    });
  }

  async renderRequestsList() {
    const box = document.getElementById('msgRequestsList');
    if (!box) return;

    if (!this.requests.length) {
      box.innerHTML = `
        <div class="msg-empty-notice">
          <i class="fa-solid fa-user-group"></i>
          <h4>No pending requests</h4>
          <p>When other travelers send you a connection request, you'll see them here.</p>
        </div>
      `;
      return;
    }

    const { data: profs } = await supabaseService.client
      .from('profiles')
      .select('id, username, full_name, avatar_url, avatar_color, home_country')
      .in('id', this.requests);

    const profMap = new Map((profs || []).map((p) => [p.id, p]));

    box.innerHTML = this.requests.map((uid) => {
      const p = profMap.get(uid) || { username: 'Explorer' };
      const name = p.full_name || p.username;
      const color = p.avatar_color || '#8b5cf6';

      return `
        <div class="msg-request-card" data-req-id="${uid}">
          <span class="avatar-dot msg-convo-avatar" style="--avatar:${color};">
            ${name.charAt(0).toUpperCase()}
          </span>
          <div class="msg-request-info">
            <strong>${name}</strong>
            <small>${p.home_country || 'Wants to connect'}</small>
          </div>
          <div class="msg-request-actions">
            <button type="button" class="msg-req-btn accept" data-accept-id="${uid}" title="Accept Request">
              <i class="fa-solid fa-check"></i>
            </button>
            <button type="button" class="msg-req-btn decline" data-decline-id="${uid}" title="Decline Request">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    box.querySelectorAll('[data-accept-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rid = btn.dataset.acceptId;
        await supabaseService.client
          .from('friendships')
          .update({ status: 'accepted' })
          .eq('requester_id', rid)
          .eq('addressee_id', supabaseService.user.id);
        await this.loadFriends();
        this.renderRequestsList();
      });
    });

    box.querySelectorAll('[data-decline-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rid = btn.dataset.declineId;
        await supabaseService.client
          .from('friendships')
          .delete()
          .eq('requester_id', rid)
          .eq('addressee_id', supabaseService.user.id);
        await this.loadFriends();
        this.renderRequestsList();
      });
    });
  }

  /* --------------------------------------------------------------------------
     6. Active Chat Thread Management
     -------------------------------------------------------------------------- */
  async openWith(userId) {
    if (!supabaseService.user || !userId || userId === supabaseService.user.id) return;

    // Switch main tab to chat view if not active
    if (window.globalPulseApp && window.globalPulseApp.activeTab !== 'chat') {
      window.globalPulseApp.switchTab('chat');
    }

    // Switch sub-tab to chats
    this.switchSubTab('chats');

    // Fetch peer profile
    const { data: prof } = await supabaseService.client
      .from('profiles')
      .select('id, username, full_name, bio, avatar_url, avatar_color, home_country, home_city, travel_style, dream_destination, website_or_social, xp, badges')
      .eq('id', userId)
      .maybeSingle();

    if (!prof) return;
    this.activePeer = prof;

    // Show thread layout
    const threadLayout = document.getElementById('msgThreadLayout');
    const emptyState = document.getElementById('msgEmptyState');
    const sidebar = document.querySelector('.msg-sidebar');

    if (emptyState) emptyState.hidden = true;
    if (threadLayout) threadLayout.hidden = false;
    if (sidebar && window.innerWidth <= 768) {
      sidebar.classList.add('mobile-hidden');
    }

    // Render Chat Header
    this.renderThreadHeader(prof);

    // Load message stream
    const me = supabaseService.user.id;
    const { data: msgs } = await supabaseService.client
      .from('messages')
      .select('id, sender_id, recipient_id, body, created_at')
      .or(`and(sender_id.eq.${me},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${me})`)
      .order('created_at', { ascending: true })
      .limit(150);

    const stream = document.getElementById('msgStream');
    if (stream) {
      stream.innerHTML = (msgs || []).map((m) => this.messageBubbleHtml(m, me)).join('') ||
        `<div class="msg-welcome-banner">
           <i class="fa-solid fa-hand-wave"></i>
           <h4>Say hello to ${prof.full_name || prof.username}! 👋</h4>
           <p>Start a conversation and share travel stories or meetup spots.</p>
         </div>`;
      stream.scrollTop = stream.scrollHeight;
    }

    // Mark as read in background
    supabaseService.client
      .from('messages')
      .update({ read: true })
      .eq('sender_id', userId)
      .eq('recipient_id', me)
      .eq('read', false)
      .then(() => {
        this.unreadByPeer.delete(userId);
        this.updateUnreadBadges();
        this.renderConversationList();
      });

    // Populate Right Info Panel
    this.renderInfoPanel(prof);

    // Focus input
    setTimeout(() => {
      document.getElementById('msgInput')?.focus();
    }, 150);
  }

  renderThreadHeader(prof) {
    const avatarWrap = document.getElementById('msgPeerAvatarWrap');
    const nameEl = document.getElementById('msgPeerName');
    const styleEl = document.getElementById('msgPeerStyleBadge');

    const name = prof.full_name || prof.username || 'Explorer';
    if (nameEl) nameEl.textContent = name;

    if (avatarWrap) {
      avatarWrap.innerHTML = prof.avatar_url
        ? `<img src="${prof.avatar_url}" alt="${name}" class="msg-peer-avatar" />`
        : `<span class="avatar-dot msg-peer-avatar" style="--avatar:${prof.avatar_color || '#06b6d4'};">
             ${(prof.username || name).charAt(0).toUpperCase()}
           </span>`;
    }

    if (styleEl) {
      if (prof.travel_style) {
        styleEl.hidden = false;
        styleEl.textContent = prof.travel_style.replace(/^[^\w]+/, '').trim();
      } else {
        styleEl.hidden = true;
      }
    }
  }

  async renderInfoPanel(prof) {
    const body = document.getElementById('msgInfoBody');
    if (!body) return;

    const name = prof.full_name || prof.username || 'Explorer';
    const lvl = gamificationService.levelFor(prof.xp || 0);

    // Fetch visited count
    const { count: visitedCount } = await supabaseService.client
      .from('visited_countries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', prof.id);

    const avatarHtml = prof.avatar_url
      ? `<img src="${prof.avatar_url}" alt="${name}" class="msg-info-avatar" />`
      : `<span class="avatar-dot msg-info-avatar" style="--avatar:${prof.avatar_color || '#06b6d4'};">
           ${(prof.username || name).charAt(0).toUpperCase()}
         </span>`;

    body.innerHTML = `
      <div class="msg-info-hero">
        ${avatarHtml}
        <h3>${name}</h3>
        <span class="msg-info-username">@${prof.username}</span>
        <div class="msg-info-level-pill">
          <i class="fa-solid fa-bolt" style="color:var(--accent-amber);"></i>
          <span>${lvl.name} &bull; ${prof.xp || 0} XP</span>
        </div>
      </div>

      ${prof.bio ? `
        <div class="msg-info-bio">
          <i class="fa-solid fa-quote-left"></i>
          <p>${this.escapeHtml(prof.bio)}</p>
        </div>` : ''}

      <div class="msg-info-stats-grid">
        <div class="msg-info-stat-card">
          <strong>${visitedCount || 0}</strong>
          <span>Countries Visited</span>
        </div>
        <div class="msg-info-stat-card">
          <strong>${Array.isArray(prof.badges) ? prof.badges.length : 0}</strong>
          <span>Badges Earned</span>
        </div>
      </div>

      <div class="msg-info-details-list">
        ${prof.home_country ? `
          <div class="msg-info-row">
            <span class="msg-info-label"><i class="fa-solid fa-house"></i> Home Base</span>
            <span class="msg-info-val">${prof.home_city ? `${prof.home_city}, ` : ''}${prof.home_country}</span>
          </div>` : ''}

        ${prof.travel_style ? `
          <div class="msg-info-row">
            <span class="msg-info-label"><i class="fa-solid fa-compass"></i> Travel Style</span>
            <span class="msg-info-val">${prof.travel_style}</span>
          </div>` : ''}

        ${prof.dream_destination ? `
          <div class="msg-info-row">
            <span class="msg-info-label"><i class="fa-solid fa-plane-departure"></i> Dream Destination</span>
            <span class="msg-info-val">${prof.dream_destination}</span>
          </div>` : ''}
      </div>

      <div class="msg-info-actions">
        <button type="button" class="btn-secondary btn-block" id="msgViewPassportBtn">
          <i class="fa-solid fa-passport"></i> View Travel Passport
        </button>
      </div>
    `;

    document.getElementById('msgViewPassportBtn')?.addEventListener('click', () => {
      passport.openProfileCard(prof.id);
    });
  }

  messageBubbleHtml(m, me, msgId = null) {
    const mine = m.sender_id === me;
    const id = msgId || m.id || '';
    const idAttr = id ? `data-msg-id="${id}"` : '';
    const isLocationCard = m.body.startsWith('📍');

    return `
      <div class="msg-bubble-row ${mine ? 'mine' : 'theirs'}" ${idAttr}>
        <div class="msg-bubble ${isLocationCard ? 'location-bubble' : ''}">
          ${this.escapeHtml(m.body)}
        </div>
        <span class="msg-bubble-time">
          ${new Date(m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    `;
  }

  async send(body) {
    if (!this.activePeer || !supabaseService.user) return;
    const me = supabaseService.user.id;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Optimistic UI Append
    const stream = document.getElementById('msgStream');
    if (stream) {
      const banner = stream.querySelector('.msg-welcome-banner');
      if (banner) banner.remove();

      stream.insertAdjacentHTML('beforeend', this.messageBubbleHtml(
        { sender_id: me, body, created_at: new Date().toISOString() },
        me,
        tempId
      ));
      stream.scrollTop = stream.scrollHeight;
    }

    const { data, error } = await supabaseService.client
      .from('messages')
      .insert({
        sender_id: me,
        recipient_id: this.activePeer.id,
        body
      })
      .select()
      .maybeSingle();

    if (error) {
      console.warn('Message send failed:', error.message);
      const tempEl = document.querySelector(`[data-msg-id="${tempId}"]`);
      if (tempEl) tempEl.style.opacity = '0.4';
      return;
    }

    if (data && data.id) {
      const tempEl = document.querySelector(`[data-msg-id="${tempId}"]`);
      if (tempEl) tempEl.setAttribute('data-msg-id', data.id);
    }

    // Refresh conversation list in sidebar
    this.loadConversations().then(() => this.renderConversationList());

    // Award chatty badge at 10 sent messages
    const { count } = await supabaseService.client
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('sender_id', me);
    if (count >= 10) gamificationService.grantBadge('chatty');
  }

  shareMyLocation() {
    const loc = window.globalPulseApp?.userLocation;
    if (!loc) {
      window.globalPulseApp?.showToast?.('Detecting your location, please wait...', 'info');
      return;
    }
    const locMsg = `📍 Location: ${loc.city || ''}, ${loc.country || ''} (${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)})`;
    this.send(locMsg);
  }

  /* --------------------------------------------------------------------------
     7. Realtime Synchronization
     -------------------------------------------------------------------------- */
  subscribe() {
    if (!supabaseService.configured || !supabaseService.user) return;
    if (this.channel) {
      this.unsubscribe();
    }

    this.channel = supabaseService.client
      .channel('globalpulse-messenger-chat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        this.handleIncoming(payload);
      })
      .subscribe();
  }

  unsubscribe() {
    if (this.channel && supabaseService.configured) {
      supabaseService.client.removeChannel(this.channel);
      this.channel = null;
    }
  }

  handleIncoming(payload) {
    const m = payload.new;
    if (!m || !supabaseService.user) return;
    const me = supabaseService.user.id;
    const peerId = m.sender_id === me ? m.recipient_id : m.sender_id;

    // Append to active stream if thread is open
    if (this.activePeer && this.activePeer.id === peerId) {
      const stream = document.getElementById('msgStream');
      if (stream) {
        // Skip duplicate ID
        const existing = stream.querySelector(`[data-msg-id="${m.id}"]`);
        if (existing) return;

        // Associate temp bubble with confirmed DB ID
        if (m.sender_id === me) {
          const tempEls = stream.querySelectorAll('.msg-bubble-row.mine[data-msg-id^="temp_"]');
          for (const el of tempEls) {
            const bubble = el.querySelector('.msg-bubble');
            if (bubble && bubble.textContent.trim() === m.body.trim()) {
              el.setAttribute('data-msg-id', m.id);
              return;
            }
          }
        }

        const banner = stream.querySelector('.msg-welcome-banner');
        if (banner) banner.remove();

        stream.insertAdjacentHTML('beforeend', this.messageBubbleHtml(m, me, m.id));
        stream.scrollTop = stream.scrollHeight;
      }

      if (m.recipient_id === me) {
        supabaseService.client.from('messages').update({ read: true }).eq('id', m.id);
      }
    } else if (m.recipient_id === me) {
      this.unreadByPeer.set(peerId, (this.unreadByPeer.get(peerId) || 0) + 1);
      this.updateUnreadBadges();
    }

    this.loadConversations().then(() => this.renderConversationList());
  }

  updateUnreadBadges() {
    const total = [...this.unreadByPeer.values()].reduce((a, b) => a + b, 0);

    // Desktop Nav Badge
    const navBadge = document.getElementById('navChatBadge');
    if (navBadge) {
      navBadge.hidden = total === 0;
      navBadge.textContent = total > 9 ? '9+' : String(total);
    }

    // Sidebar Chats Tab Badge Dot
    const chatsBadge = document.getElementById('msgChatsBadge');
    if (chatsBadge) {
      chatsBadge.hidden = total === 0;
    }
  }

  renderRequestsBadge() {
    const badge = document.getElementById('msgRequestsBadge');
    if (!badge) return;
    const count = this.requests.length;
    badge.hidden = count === 0;
    badge.textContent = String(count);
  }

  /* --------------------------------------------------------------------------
     8. Helpers
     -------------------------------------------------------------------------- */
  formatTime(isoStr) {
    if (!isoStr) return '';
    const date = new Date(isoStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  escapeHtml(str = '') {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export const messengerView = new MessengerView();
