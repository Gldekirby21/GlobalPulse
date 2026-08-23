/**
 * Chat Panel — direct messages, friend requests & social graph
 * Slide-in drawer; header button with unread badge (logged-in only).
 * Also owns the Everyone/Friends community tabs and friend requests.
 */

import { supabaseService } from '../services/supabaseService.js';
import { gamificationService } from '../services/gamificationService.js';

class ChatPanel {
    constructor() {
        this.drawer = null;
        this.activePeer = null;
        this.unreadByPeer = new Map(); // peerId -> count
        this.friends = new Map();      // userId -> {username, avatar_color}
        this.requests = [];            // incoming pending friendships
        this.outgoing = new Set();     // ids I've requested
        this.channel = null;
        this.communityTab = 'everyone';
    }

    /* ------------------------------ Setup ------------------------------ */

    init() {
        this.injectHeaderButton();
        this.ensureDrawer();
        this.injectCommunityTabs();
        this.bindMessengerPageEvents();

        // Delegated actions from community list items & popups
        document.addEventListener('click', (e) => {
            const chatBtn = e.target.closest('[data-chat-user]');
            if (chatBtn) {
                this.openWith(chatBtn.dataset.chatUser);
                return;
            }
            const addBtn = e.target.closest('[data-addfriend-user]');
            if (addBtn) {
                this.sendFriendRequest(addBtn.dataset.addfriendUser, addBtn);
            }
            const tab = e.target.closest('.community-tab');
            if (tab) {
                this.communityTab = tab.dataset.ctab;
                document.querySelectorAll('.community-tab').forEach((t) =>
                    t.classList.toggle('active', t === tab)
                );
                document.dispatchEvent(new CustomEvent('globalpulse:communitytab', {
                    detail: { tab: this.communityTab }
                }));
            }
        });
    }

    bindMessengerPageEvents() {
        const form = document.getElementById('messengerForm');
        const input = document.getElementById('messengerInput');
        const search = document.getElementById('messengerSearchInput');

        if (form && input) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const body = input.value.trim();
                if (body) {
                    this.send(body);
                    input.value = '';
                }
            });
        }

        if (search) {
            search.addEventListener('input', () => {
                const q = search.value.toLowerCase().trim();
                document.querySelectorAll('#messengerConvosList .chat-convo-row').forEach((row) => {
                    const name = row.querySelector('strong')?.textContent.toLowerCase() || '';
                    row.style.display = name.includes(q) ? 'flex' : 'none';
                });
            });
        }
    }

    injectHeaderButton() {
        if (document.getElementById('chatToggleBtn')) return;
        const actions = document.querySelector('.nav-actions');
        const themeBtn = document.getElementById('themeToggleBtn');
        if (!actions || !themeBtn) return;

        const btn = document.createElement('button');
        btn.className = 'icon-btn';
        btn.id = 'chatToggleBtn';
        btn.title = 'Messages & Friend Requests';
        btn.hidden = true;
        btn.innerHTML = `
      <i class="fa-solid fa-comment-dots"></i>
      <span class="chat-unread-badge" id="chatUnreadBadge" hidden></span>`;
        btn.addEventListener('click', () => this.toggle());
        actions.insertBefore(btn, themeBtn);
    }

    ensureDrawer() {
        if (this.drawer) return this.drawer;

        this.drawer = document.createElement('div');
        this.drawer.className = 'chat-drawer';
        this.drawer.id = 'chatDrawer';
        this.drawer.hidden = true;
        this.drawer.innerHTML = `
      <div class="chat-drawer-header">
        <h3><i class="fa-solid fa-comments"></i> Messages</h3>
        <button class="chat-close-btn" id="chatCloseBtn" aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="chat-requests" id="chatRequests"></div>
      <div class="chat-conversations" id="chatConversations"></div>
      <div class="chat-thread" id="chatThread" hidden>
        <div class="chat-thread-header">
          <button class="chat-back-btn" id="chatBackBtn" aria-label="Back">
            <i class="fa-solid fa-arrow-left"></i>
          </button>
          <div id="chatThreadPeer"></div>
        </div>
        <div class="chat-messages" id="chatMessages"></div>
        <form class="chat-input-row" id="chatForm">
          <input id="chatInput" maxlength="500" placeholder="Type a message..." autocomplete="off" />
          <button type="submit" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button>
        </form>
      </div>`;
        document.body.appendChild(this.drawer);

        document.getElementById('chatCloseBtn').addEventListener('click', () => this.close());
        document.getElementById('chatBackBtn').addEventListener('click', () => this.showList());
        document.getElementById('chatForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('chatInput');
            const body = input.value.trim();
            if (body) this.send(body);
            input.value = '';
        });
        return this.drawer;
    }

    injectCommunityTabs() {
        const panel = document.getElementById('communityPanel');
        const header = panel?.querySelector('.community-panel-header');
        if (!header || header.querySelector('.community-tabs')) return;

        const tabs = document.createElement('div');
        tabs.className = 'community-tabs';
        tabs.hidden = true; // shown only when logged in
        tabs.innerHTML = `
      <button class="community-tab active" data-ctab="everyone">Everyone</button>
      <button class="community-tab" data-ctab="friends">Friends</button>`;
        header.appendChild(tabs);
        this._tabsEl = tabs;
    }

    /* ----------------------------- Session ----------------------------- */

    setSession(session) {
        if (session) {
            const btn = document.getElementById('chatToggleBtn');
            if (btn) btn.hidden = false;
            if (this._tabsEl) this._tabsEl.hidden = false;
            this.loadFriends();
            this.subscribe();
            this.refreshUnread();
        } else {
            const btn = document.getElementById('chatToggleBtn');
            if (btn) btn.hidden = true;
            if (this._tabsEl) this._tabsEl.hidden = true;
            this.close();
            this.unsubscribe();
            this.friends.clear();
            this.requests = [];
            this.outgoing.clear();
            this.unreadByPeer.clear();
            this.updateBadge();
        }
    }

    toggle() {
        this.drawer.hidden ? this.show() : this.close();
    }

    show() {
        this.ensureDrawer();
        this.drawer.hidden = false;
        requestAnimationFrame(() => this.drawer.classList.add('open'));
        this.showList();
    }

    close() {
        if (!this.drawer) return;
        this.drawer.classList.remove('open');
        this.drawer.classList.remove('thread-open');
        setTimeout(() => { this.drawer.hidden = true; }, 300);
        this.activePeer = null;
    }

    /* ------------------------------ Friends ---------------------------- */

    async loadFriends() {
        if (!supabaseService.user) return;
        const me = supabaseService.user.id;

        const { data, error } = await supabaseService.client
            .from('friendships')
            .select('requester_id, addressee_id, status')
            .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
        if (error) return console.warn('Friends load failed:', error.message);

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
                .select('id, username, avatar_color')
                .in('id', [...ids]);
            (profs || []).forEach((p) =>
                this.friends.set(p.id, { username: p.username, avatar_color: p.avatar_color })
            );
        }

        this.renderRequests();
        document.dispatchEvent(new CustomEvent('globalpulse:friendsloaded'));
    }

    getFriendIds() {
        return [...this.friends.keys()];
    }

    async sendFriendRequest(userId, btnEl) {
        if (!supabaseService.user || !userId || userId === supabaseService.user.id) return;
        if (this.friends.has(userId) || this.outgoing.has(userId)) return;

        const { error } = await supabaseService.client
            .from('friendships')
            .insert({ requester_id: supabaseService.user.id, addressee_id: userId });
        if (error && error.code !== '23505') {
            return console.warn('Friend request failed:', error.message);
        }

        this.outgoing.add(userId);
        if (btnEl) {
            btnEl.innerHTML = '<i class="fa-solid fa-clock"></i>';
            btnEl.disabled = true;
            btnEl.title = 'Request sent';
        }
    }

    async acceptRequest(requesterId) {
        await supabaseService.client
            .from('friendships')
            .update({ status: 'accepted' })
            .eq('requester_id', requesterId)
            .eq('addressee_id', supabaseService.user.id);
        await this.loadFriends();
    }

    async declineRequest(requesterId) {
        await supabaseService.client
            .from('friendships')
            .delete()
            .eq('requester_id', requesterId)
            .eq('addressee_id', supabaseService.user.id);
        await this.loadFriends();
    }

    renderRequests() {
        const box = document.getElementById('chatRequests');
        const pageBox = document.getElementById('messengerRequestsWrap');

        if (!this.requests.length) {
            if (box) { box.innerHTML = ''; box.style.display = 'none'; }
            if (pageBox) { pageBox.innerHTML = ''; pageBox.style.display = 'none'; }
            return;
        }

        const html = `
      <div class="chat-section-title" style="padding:0.6rem 0.85rem; font-size:0.78rem; font-weight:800; color:var(--text-muted);"><i class="fa-solid fa-user-plus"></i> Friend Requests</div>
      ${this.requests.map((id) => `
        <div class="chat-request-row" data-req-id="${id}" style="display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0.85rem;">
          <span class="avatar-dot" style="--avatar:#8b5cf6; width:28px; height:28px; font-size:0.75rem;">?</span>
          <span class="chat-req-name" style="flex:1; font-size:0.82rem; font-weight:700;">Explorer</span>
          <button class="chat-req-btn accept" data-accept="${id}" title="Accept" style="background:var(--accent-emerald); color:#fff; border:none; border-radius:4px; padding:0.25rem 0.5rem; cursor:pointer;">
            <i class="fa-solid fa-check"></i>
          </button>
          <button class="chat-req-btn decline" data-decline="${id}" title="Decline" style="background:var(--accent-rose); color:#fff; border:none; border-radius:4px; padding:0.25rem 0.5rem; cursor:pointer;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>`).join('')}`;

        [box, pageBox].forEach((container) => {
            if (container) {
                container.style.display = 'block';
                container.innerHTML = html;
                container.querySelectorAll('[data-accept]').forEach((b) =>
                    b.addEventListener('click', () => this.acceptRequest(b.dataset.accept))
                );
                container.querySelectorAll('[data-decline]').forEach((b) =>
                    b.addEventListener('click', () => this.declineRequest(b.dataset.decline))
                );
            }
        });
    }

    /* --------------------------- Conversations -------------------------- */

    async loadConversations() {
        if (!supabaseService.user) return [];
        const me = supabaseService.user.id;

        const { data, error } = await supabaseService.client
            .from('messages')
            .select('id, sender_id, recipient_id, body, read, created_at')
            .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
            .order('created_at', { ascending: false })
            .limit(200);
        if (error) return console.warn('Conversations load failed:', error.message);

        // Group by peer, keep latest message + unread count
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
        return [...convos.values()];
    }

    async renderConversationList() {
        const box = document.getElementById('chatConversations');
        const pageBox = document.getElementById('messengerConvosList');

        if (!supabaseService.user) {
            const notAuthHtml = `
              <div class="messenger-auth-prompt" style="padding:2.5rem 1.25rem; text-align:center; display:flex; flex-direction:column; align-items:center;">
                <div style="width:56px; height:56px; border-radius:50%; background:rgba(6, 182, 212, 0.12); border:1.5px solid var(--accent-cyan); display:flex; align-items:center; justify-content:center; font-size:1.5rem; color:var(--accent-cyan); margin-bottom:1rem;">
                  <i class="fa-solid fa-lock"></i>
                </div>
                <h4 style="font-size:1.05rem; font-weight:800; color:var(--text-primary); margin-bottom:0.4rem;">Sign in to Chat</h4>
                <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:1.25rem; line-height:1.4;">Connect and exchange travel tips with travelers around the world.</p>
                <button type="button" class="btn-primary btn-sm" id="btnMessengerAuth" style="font-weight:800; padding:0.5rem 1.25rem; border-radius:var(--radius-full);">
                  <i class="fa-solid fa-right-to-bracket"></i> Sign In / Register
                </button>
              </div>`;
            if (box) box.innerHTML = notAuthHtml;
            if (pageBox) {
                pageBox.innerHTML = notAuthHtml;
                pageBox.querySelectorAll('#btnMessengerAuth').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        window.globalPulseApp?.authModal?.open('signin');
                    });
                });
            }
            return;
        }

        const convos = await this.loadConversations();
        this.updateBadge();

        if (!convos.length) {
            // Fetch online/active community users to suggest starting a conversation
            let suggestedList = [
                { id: 'mock_u1', username: 'Aoi Tanaka', avatar_color: '#ec4899', home_country: 'Japan' },
                { id: 'mock_u2', username: 'Marco Rivera', avatar_color: '#06b6d4', home_country: 'Philippines' },
                { id: 'mock_u3', username: 'Elena Rostova', avatar_color: '#8b5cf6', home_country: 'France' }
            ];

            if (supabaseService.configured) {
                const { data: travelers } = await supabaseService.client
                    .from('profiles')
                    .select('id, username, full_name, avatar_url, avatar_color, home_country')
                    .neq('id', supabaseService.user.id)
                    .limit(8);
                if (travelers && travelers.length) suggestedList = travelers;
            }

            const emptyHtml = `
              <div style="padding:1rem 0.5rem;">
                <div style="padding:0.5rem; text-align:center; color:var(--text-muted); font-size:0.82rem; margin-bottom:0.75rem;">
                  <i class="fa-solid fa-paper-plane" style="font-size:1.5rem; color:var(--accent-cyan); margin-bottom:0.35rem; display:block;"></i>
                  Start a new conversation with explorers:
                </div>
                <div style="display:flex; flex-direction:column; gap:0.45rem;">
                  ${suggestedList.map((t) => `
                    <button class="chat-convo-row" data-peer="${t.id}">
                      <span class="avatar-dot" style="--avatar:${t.avatar_color || '#06b6d4'}; width:36px; height:36px; font-size:0.85rem;">
                        ${(t.username || '?').charAt(0).toUpperCase()}
                      </span>
                      <span class="chat-convo-info">
                        <strong>${t.full_name || t.username}</strong>
                        <small>📍 ${t.home_country || 'World Explorer'} &bull; Say hi 👋</small>
                      </span>
                      <i class="fa-solid fa-comment-dots" style="color:var(--accent-cyan); font-size:0.85rem;"></i>
                    </button>
                  `).join('')}
                </div>
              </div>`;

            if (box) box.innerHTML = emptyHtml;
            if (pageBox) pageBox.innerHTML = emptyHtml;

            [box, pageBox].forEach((c) => {
                c?.querySelectorAll('.chat-convo-row').forEach((row) =>
                    row.addEventListener('click', () => this.openWith(row.dataset.peer))
                );
            });
            return;
        }

        // Resolve peer profiles
        const ids = convos.map((c) => c.peerId);
        const { data: profs } = await supabaseService.client
            .from('profiles')
            .select('id, username, avatar_color')
            .in('id', ids);
        const profMap = new Map((profs || []).map((p) => [p.id, p]));

        const listHtml = convos.map(({ peerId, last }) => {
            const p = profMap.get(peerId);
            const name = p?.username || 'Explorer';
            const color = p?.avatar_color || '#06b6d4';
            const unread = this.unreadByPeer.get(peerId) || 0;
            const time = new Date(last.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
        <button class="chat-convo-row" data-peer="${peerId}">
          <span class="avatar-dot" style="--avatar:${color}; width:38px; height:38px; font-size:0.9rem;">${name.charAt(0).toUpperCase()}</span>
          <span class="chat-convo-info">
            <strong>${name}</strong>
            <small>${last.body.slice(0, 40)}${last.body.length > 40 ? '…' : ''}</small>
          </span>
          <span class="chat-convo-meta">
            <small>${time}</small>
            ${unread ? `<span class="chat-unread-badge">${unread}</span>` : ''}
          </span>
        </button>`;
        }).join('');

        [box, pageBox].forEach((container) => {
            if (container) {
                container.innerHTML = listHtml;
                container.querySelectorAll('.chat-convo-row').forEach((row) =>
                    row.addEventListener('click', () => this.openWith(row.dataset.peer))
                );
            }
        });
    }

    async openWith(userId) {
        if (!supabaseService.user || !userId || userId === supabaseService.user.id) return;

        const { data: prof } = await supabaseService.client
            .from('profiles')
            .select('id, username, avatar_color')
            .eq('id', userId)
            .maybeSingle();
        if (!prof) return;

        this.activePeer = prof;

        // If drawer is open, show in drawer
        if (!this.drawer?.hidden) {
            this.showThread();
        }

        // Update Full-Page Messenger Header & Inputs
        const pName = document.getElementById('messengerPeerName');
        const pStatus = document.getElementById('messengerPeerStatus');
        const pInfo = document.getElementById('messengerPeerInfo');
        const mInput = document.getElementById('messengerInput');
        const mBtn = document.getElementById('messengerSendBtn');
        const ws = document.querySelector('.messenger-workspace');

        if (pName) pName.textContent = prof.username || 'Explorer';
        if (pStatus) pStatus.textContent = 'Active now • Pulse Messenger';
        if (pInfo) {
            pInfo.innerHTML = `
              <span class="avatar-dot" style="--avatar:${prof.avatar_color || '#06b6d4'}; width:40px; height:40px; font-size:0.9rem;">
                ${(prof.username || '?').charAt(0).toUpperCase()}
              </span>
              <div>
                <h4 id="messengerPeerName">${prof.username || 'Explorer'}</h4>
                <small id="messengerPeerStatus" style="color:var(--text-muted);">Active now &bull; Pulse Messenger</small>
              </div>`;
        }
        if (mInput) { mInput.disabled = false; mInput.focus(); }
        if (mBtn) mBtn.disabled = false;
        if (ws) ws.classList.add('thread-active');

        // Load thread
        const me = supabaseService.user.id;
        const { data: msgs } = await supabaseService.client
            .from('messages')
            .select('id, sender_id, recipient_id, body, created_at')
            .or(`and(sender_id.eq.${me},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${me})`)
            .order('created_at', { ascending: true })
            .limit(100);

        const msgsHtml = (msgs || []).map((m) => this._messageHtml(m, me)).join('') ||
            '<p class="community-empty" style="padding:2rem; text-align:center; color:var(--text-muted);">Say hello 👋</p>';

        const box = document.getElementById('chatMessages');
        if (box) box.innerHTML = msgsHtml;

        const pageStream = document.getElementById('messengerMessagesStream');
        if (pageStream) pageStream.innerHTML = msgsHtml;

        this.scrollToBottom(false);

        // Mark incoming as read
        await supabaseService.client
            .from('messages')
            .update({ read: true })
            .eq('sender_id', userId)
            .eq('recipient_id', me)
            .eq('read', false);
        this.unreadByPeer.delete(userId);
        this.updateBadge();
    }

    scrollToBottom(smooth = true) {
        const box = document.getElementById('chatMessages');
        const pageStream = document.getElementById('messengerMessagesStream');

        [box, pageStream].forEach((el) => {
            if (el) {
                requestAnimationFrame(() => {
                    el.scrollTo({
                        top: el.scrollHeight,
                        behavior: smooth ? 'smooth' : 'auto'
                    });
                });
            }
        });
    }

    _messageHtml(m, me, msgId = null) {
        const mine = m.sender_id === me;
        const id = msgId || m.id || '';
        const idAttr = id ? `data-msg-id="${id}"` : '';
        return `
      <div class="chat-msg ${mine ? 'mine' : 'theirs'}" ${idAttr}>
        <div class="chat-bubble">${m.body.replace(/</g, '&lt;')}</div>
        <small>${new Date(m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
      </div>`;
    }

    showList() {
        this.activePeer = null;
        this.drawer?.classList.remove('thread-open');
        document.getElementById('chatThread').hidden = true;
        document.getElementById('chatConversations').style.display = 'block';
        this.renderConversationList();
        this.renderRequests();
    }

    showThread() {
        const peer = this.activePeer;
        this.drawer?.classList.add('thread-open');
        document.getElementById('chatThreadPeer').innerHTML = `
      <span class="avatar-dot" style="--avatar:${peer.avatar_color || '#06b6d4'}; width:26px; height:26px; font-size:0.7rem;">
        ${(peer.username || '?').charAt(0).toUpperCase()}
      </span>
      <strong>${peer.username || 'Explorer'}</strong>`;
        document.getElementById('chatConversations').style.display = 'none';
        document.getElementById('chatThread').hidden = false;
        this.scrollToBottom(false);
        setTimeout(() => document.getElementById('chatInput')?.focus(), 100);
    }

    async send(body) {
        if (!this.activePeer || !supabaseService.user) return;
        const me = supabaseService.user.id;
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        // Optimistic UI append to both drawer and page view
        const box = document.getElementById('chatMessages');
        const pageStream = document.getElementById('messengerMessagesStream');

        [box, pageStream].forEach((container) => {
            if (container) {
                const empty = container.querySelector('.community-empty, .messenger-empty-state');
                if (empty) empty.remove();

                container.insertAdjacentHTML('beforeend', this._messageHtml(
                    { sender_id: me, body, created_at: new Date().toISOString() },
                    me,
                    tempId
                ));
            }
        });
        this.scrollToBottom(true);

        const { data, error } = await supabaseService.client.from('messages').insert({
            sender_id: me,
            recipient_id: this.activePeer.id,
            body
        }).select().maybeSingle();

        if (error) {
            console.warn('Send failed:', error.message);
            document.querySelectorAll(`[data-msg-id="${tempId}"]`).forEach((el) => {
                el.style.opacity = '0.4';
            });
            return;
        }

        if (data && data.id) {
            document.querySelectorAll(`[data-msg-id="${tempId}"]`).forEach((el) => {
                el.setAttribute('data-msg-id', data.id);
            });
        }

        // chatty badge at 10 sent messages
        const { count } = await supabaseService.client
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', me);
        if (count >= 10) gamificationService.grantBadge('chatty');
    }

    /* ------------------------------ Realtime ---------------------------- */

    subscribe() {
        if (!supabaseService.configured || !supabaseService.user) return;
        if (this.channel) {
            this.unsubscribe();
        }
        this.channel = supabaseService.client
            .channel('globalpulse-chat')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
                this._handleIncoming(payload);
            })
            .subscribe();
    }

    unsubscribe() {
        if (this.channel && supabaseService.configured) {
            supabaseService.client.removeChannel(this.channel);
            this.channel = null;
        }
    }

    _handleIncoming(payload) {
        const m = payload.new;
        if (!m || !supabaseService.user) return;
        const me = supabaseService.user.id;
        const peerId = m.sender_id === me ? m.recipient_id : m.sender_id;

        // Live-append to open thread
        if (this.activePeer && this.activePeer.id === peerId) {
            const box = document.getElementById('chatMessages');
            const pageStream = document.getElementById('messengerMessagesStream');

            [box, pageStream].forEach((container) => {
                if (!container) return;
                const existing = container.querySelector(`[data-msg-id="${m.id}"]`);
                if (existing) return;

                if (m.sender_id === me) {
                    const tempEls = container.querySelectorAll('.chat-msg.mine[data-msg-id^="temp_"]');
                    for (const el of tempEls) {
                        const bubble = el.querySelector('.chat-bubble');
                        if (bubble && bubble.textContent === m.body) {
                            el.setAttribute('data-msg-id', m.id);
                            return;
                        }
                    }
                }

                const empty = container.querySelector('.community-empty, .messenger-empty-state');
                if (empty) empty.remove();

                container.insertAdjacentHTML('beforeend', this._messageHtml(m, me, m.id));
            });

            this.scrollToBottom(true);

            if (m.recipient_id === me) {
                supabaseService.client.from('messages').update({ read: true }).eq('id', m.id);
            }
        } else if (m.recipient_id === me) {
            this.unreadByPeer.set(peerId, (this.unreadByPeer.get(peerId) || 0) + 1);
            this.updateBadge();
        }

        this.renderConversationList();
    }

    async refreshUnread() {
        await this.loadConversations();
        this.updateBadge();
    }

    updateBadge() {
        const badge = document.getElementById('chatUnreadBadge');
        if (!badge) return;
        const total = [...this.unreadByPeer.values()].reduce((a, b) => a + b, 0);
        badge.hidden = total === 0;
        badge.textContent = total > 9 ? '9+' : String(total);
    }
}

export const chatPanel = new ChatPanel();
