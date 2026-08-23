/**
 * Notification Center Component
 * Header bell icon, real-time unread badge, and interactive notification dropdown.
 */

import { supabaseService } from '../services/supabaseService.js';
import { isAuthenticated } from '../utils/access.js';

class NotificationCenter {
  constructor() {
    this.notifications = [];
    this.dropdown = null;
    this.btn = null;
    this.badge = null;
    this.channel = null;
    this.isOpen = false;
  }

  init() {
    this.injectBellButton();
    this.injectDropdown();
    this.loadNotifications();
  }

  injectBellButton() {
    if (document.getElementById('notifToggleBtn')) return;
    const actions = document.querySelector('.nav-actions');
    const themeBtn = document.getElementById('themeToggleBtn');
    if (!actions || !themeBtn) return;

    const wrap = document.createElement('div');
    wrap.className = 'notif-bell-wrap';
    wrap.innerHTML = `
      <button class="icon-btn" id="notifToggleBtn" title="Notifications" aria-label="Notifications">
        <i class="fa-solid fa-bell"></i>
        <span class="notif-badge" id="notifBadge" hidden>0</span>
      </button>
    `;
    actions.insertBefore(wrap, themeBtn);

    this.btn = wrap.querySelector('#notifToggleBtn');
    this.badge = wrap.querySelector('#notifBadge');
    this.btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });
  }

  injectDropdown() {
    if (document.getElementById('notifDropdown')) return;

    const wrap = document.querySelector('.notif-bell-wrap');
    if (!wrap) return;

    this.dropdown = document.createElement('div');
    this.dropdown.id = 'notifDropdown';
    this.dropdown.className = 'notif-dropdown';
    this.dropdown.hidden = true;
    this.dropdown.innerHTML = `
      <div class="notif-dropdown-header">
        <h4>Notifications</h4>
        <button type="button" class="notif-mark-read-btn" id="notifMarkAllReadBtn">Mark all as read</button>
      </div>
      <div class="notif-list" id="notifList"></div>
    `;
    wrap.appendChild(this.dropdown);

    document.getElementById('notifMarkAllReadBtn')?.addEventListener('click', () => {
      this.markAllAsRead();
    });

    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.dropdown.contains(e.target) && !this.btn.contains(e.target)) {
        this.closeDropdown();
      }
    });
  }

  toggleDropdown() {
    this.isOpen = !this.isOpen;
    if (this.dropdown) this.dropdown.hidden = !this.isOpen;
    if (this.isOpen) {
      this.renderList();
    }
  }

  closeDropdown() {
    this.isOpen = false;
    if (this.dropdown) this.dropdown.hidden = true;
  }

  async loadNotifications() {
    let list = [];
    if (supabaseService.configured && supabaseService.user) {
      const { data, error } = await supabaseService.client
        .from('notifications')
        .select('*, profiles!actor_id(username, full_name, avatar_url, avatar_color)')
        .eq('recipient_id', supabaseService.user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        list = data;
      }
    }

    if (!list.length) {
      list = this.getMockNotifications();
    }

    this.notifications = list;
    this.updateBadge();
    this.subscribe();
  }

  renderList() {
    const listEl = document.getElementById('notifList');
    if (!listEl) return;

    if (!this.notifications.length) {
      listEl.innerHTML = `
        <div style="padding: 2rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.84rem;">
          <i class="fa-solid fa-bell-slash" style="font-size: 1.8rem; margin-bottom: 0.5rem; display: block; opacity: 0.5;"></i>
          No notifications yet.
        </div>`;
      return;
    }

    listEl.innerHTML = this.notifications.map((n) => {
      const actor = n.profiles || {};
      const actorName = actor.full_name || actor.username || 'Travel Explorer';
      const time = this.timeAgo(n.created_at);

      let icon = '<i class="fa-solid fa-bell"></i>';
      if (n.action_type === 'like') icon = '<i class="fa-solid fa-heart" style="background:var(--accent-rose);"></i>';
      else if (n.action_type === 'comment') icon = '<i class="fa-solid fa-comment" style="background:var(--accent-cyan);"></i>';
      else if (n.action_type === 'friend_request') icon = '<i class="fa-solid fa-user-plus" style="background:var(--accent-purple);"></i>';
      else if (n.action_type === 'badge_unlock') icon = '<i class="fa-solid fa-award" style="background:var(--accent-amber);"></i>';

      const avatarSrc = actor.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

      return `
        <div class="notif-item ${!n.read ? 'unread' : ''}" data-notif-id="${n.id}">
          <div class="notif-avatar-wrap">
            <img src="${avatarSrc}" alt="${actorName}" class="notif-avatar" />
            <span class="notif-type-icon">${icon}</span>
          </div>
          <div class="notif-body">
            <div><strong>${actorName}</strong> ${this.escapeHtml(n.message)}</div>
            <div class="notif-time">${time}</div>
          </div>
          ${!n.read ? '<span class="notif-unread-dot"></span>' : ''}
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.notif-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.notifId;
        const target = this.notifications.find((n) => n.id === id);
        if (target) {
          target.read = true;
          this.updateBadge();
          this.renderList();
          this.closeDropdown();
          if (target.post_id) {
            window.globalPulseApp?.switchTab?.('feed');
          }
        }
      });
    });
  }

  updateBadge() {
    const unread = this.notifications.filter((n) => !n.read).length;
    if (this.badge) {
      this.badge.hidden = unread === 0;
      this.badge.textContent = unread > 9 ? '9+' : String(unread);
    }
  }

  async markAllAsRead() {
    this.notifications.forEach((n) => { n.read = true; });
    this.updateBadge();
    this.renderList();

    if (supabaseService.configured && supabaseService.user) {
      await supabaseService.client
        .from('notifications')
        .update({ read: true })
        .eq('recipient_id', supabaseService.user.id);
    }
  }

  subscribe() {
    if (!supabaseService.configured || !supabaseService.user || this.channel) return;

    this.channel = supabaseService.client
      .channel('globalpulse-notifs')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${supabaseService.user.id}`
      }, (payload) => {
        this.notifications.unshift(payload.new);
        this.updateBadge();
        if (this.isOpen) this.renderList();
      })
      .subscribe();
  }

  getMockNotifications() {
    return [
      {
        id: 'n1',
        action_type: 'like',
        message: 'liked your travel story from Boracay! ❤️',
        read: false,
        created_at: new Date(Date.now() - 600000).toISOString(),
        profiles: { username: 'Aoi Tanaka' }
      },
      {
        id: 'n2',
        action_type: 'comment',
        message: 'commented on your photo: "Ganda naman diyan! 🏝️"',
        read: false,
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        profiles: { username: 'Marco Rivera' }
      },
      {
        id: 'n3',
        action_type: 'badge_unlock',
        message: 'You unlocked a new badge: "Globetrotter Level 2" 🎖️',
        read: true,
        created_at: new Date(Date.now() - 86400000).toISOString(),
        profiles: { username: 'GlobalPulse' }
      }
    ];
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

export const notificationCenter = new NotificationCenter();
