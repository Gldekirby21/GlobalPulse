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
        if (!box) return;

        if (!this.requests.length) {
            box.innerHTML = '';
            box.style.display = 'none';
            return;
        }

        box.style.display = 'block';
        box.innerHTML = `
      <div class="chat-section-title"><i class="fa-solid fa-user-plus"></i> Friend Requests</div>
      ${this.requests.map((id) => `
        <div class="chat-request-row" data-req-id="${id}">
          <span class="avatar-dot" style="--avatar:#8b5cf6;">?</span>
          <span class="chat-req-name">Explorer</span>
          <button class="chat-req-btn accept" data-accept="${id}" title="Accept">
            <i class="fa-solid fa-check"></i>
          </button>
          <button class="chat-req-btn decline" data-decline="${id}" title="Decline">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>`).join('')}`;

        box.querySelectorAll('[data-accept]').forEach((b) =>
            b.addEventListener('click', () => this.acceptRequest(b.dataset.accept))
        );
        box.querySelectorAll('[data-decline]').forEach((b) =>
            b.addEventListener('click', () => this.declineRequest(b.dataset.decline))
        );
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
        if (!box) return;

        const convos = await this.loadConversations();
        this.updateBadge();

        if (!convos.length) {
            box.innerHTML = `
        <p class="community-empty">No conversations yet.<br/>
        Click a community explorer on the map and hit “💬” to say hi!</p>`;
            return;
        }

        // Resolve peer profiles
        const ids = convos.map((c) => c.peerId);
        const { data: profs } = await supabaseService.client
            .from('profiles')
            .select('id, username, avatar_color')
            .in('id', ids);
        const profMap = new Map((profs || []).map((p) => [p.id, p]));

        box.innerHTML = convos.map(({ peerId, last }) => {
            const p = profMap.get(peerId);
            const name = p?.username || 'Explorer';
            const color = p?.avatar_color || '#06b6d4';
            const unread = this.unreadByPeer.get(peerId) || 0;
            const time = new Date(last.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
        <button class="chat-convo-row" data-peer="${peerId}">
          <span class="avatar-dot" style="--avatar:${color};">${name.charAt(0).toUpperCase()}</span>
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

        box.querySelectorAll('.chat-convo-row').forEach((row) =>
            row.addEventListener('click', () => this.openWith(row.dataset.peer))
        );
    }

    async openWith(userId) {
        if (!supabaseService.user || !userId || userId === supabaseService.user.id) return;
        this.ensureDrawer();
        this.show();

        const { data: prof } = await supabaseService.client
            .from('profiles')
            .select('id, username, avatar_color')
            .eq('id', userId)
            .maybeSingle();
        if (!prof) return;

        this.activePeer = prof;
        this.showThread();

        // Load thread
        const me = supabaseService.user.id;
        const { data: msgs } = await supabaseService.client
            .from('messages')
            .select('id, sender_id, recipient_id, body, created_at')
            .or(`and(sender_id.eq.${me},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${me})`)
            .order('created_at', { ascending: true })
            .limit(100);

        const box = document.getElementById('chatMessages');
        box.innerHTML = (msgs || []).map((m) => this._messageHtml(m, me)).join('') ||
            '<p class="community-empty">Say hello 👋</p>';
        box.scrollTop = box.scrollHeight;

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
        document.getElementById('chatThread').hidden = true;
        document.getElementById('chatConversations').style.display = 'block';
        this.renderConversationList();
        this.renderRequests();
    }

    showThread() {
        const peer = this.activePeer;
        document.getElementById('chatThreadPeer').innerHTML = `
      <span class="avatar-dot" style="--avatar:${peer.avatar_color || '#06b6d4'}; width:26px; height:26px; font-size:0.7rem;">
        ${(peer.username || '?').charAt(0).toUpperCase()}
      </span>
      <strong>${peer.username || 'Explorer'}</strong>`;
        document.getElementById('chatConversations').style.display = 'none';
        document.getElementById('chatThread').hidden = false;
        setTimeout(() => document.getElementById('chatInput')?.focus(), 100);
    }

    async send(body) {
        if (!this.activePeer || !supabaseService.user) return;
        const me = supabaseService.user.id;
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        // Optimistic UI append
        const box = document.getElementById('chatMessages');
        if (box) {
            const empty = box.querySelector('.community-empty');
            if (empty) empty.remove();

            box.insertAdjacentHTML('beforeend', this._messageHtml(
                { sender_id: me, body, created_at: new Date().toISOString() },
                me,
                tempId
            ));
            box.scrollTop = box.scrollHeight;
        }

        const { data, error } = await supabaseService.client.from('messages').insert({
            sender_id: me,
            recipient_id: this.activePeer.id,
            body
        }).select().maybeSingle();

        if (error) {
            console.warn('Send failed:', error.message);
            const tempEl = document.querySelector(`[data-msg-id="${tempId}"]`);
            if (tempEl) tempEl.style.opacity = '0.4';
            return;
        }

        if (data && data.id) {
            const tempEl = document.querySelector(`[data-msg-id="${tempId}"]`);
            if (tempEl) tempEl.setAttribute('data-msg-id', data.id);
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
        if (this.activePeer && this.activePeer.id === peerId && !this.drawer.hidden) {
            const box = document.getElementById('chatMessages');
            if (box) {
                // If message already rendered by id, SKIP!
                const existing = box.querySelector(`[data-msg-id="${m.id}"]`);
                if (existing) return;

                // If sent by me, associate with pending optimistic temp bubble
                if (m.sender_id === me) {
                    const tempEls = box.querySelectorAll('.chat-msg.mine[data-msg-id^="temp_"]');
                    for (const el of tempEls) {
                        const bubble = el.querySelector('.chat-bubble');
                        if (bubble && bubble.textContent === m.body) {
                            el.setAttribute('data-msg-id', m.id);
                            return; // deduplicated successfully
                        }
                    }
                }

                const empty = box.querySelector('.community-empty');
                if (empty) empty.remove();

                box.insertAdjacentHTML('beforeend', this._messageHtml(m, me, m.id));
                box.scrollTop = box.scrollHeight;
            }

            if (m.recipient_id === me) {
                supabaseService.client.from('messages').update({ read: true }).eq('id', m.id);
            }
        } else if (m.recipient_id === me) {
            this.unreadByPeer.set(peerId, (this.unreadByPeer.get(peerId) || 0) + 1);
            this.updateBadge();
        }

        if (!this.drawer.hidden && !this.activePeer) this.renderConversationList();
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
