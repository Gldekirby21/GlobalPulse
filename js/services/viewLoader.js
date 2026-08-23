/**
 * GlobalPulse Modular View Loader & Session Guard
 * Loads view sections from views/*.html partials and enforces
 * role/session access control across all application tabs.
 */

import { supabaseService } from './supabaseService.js';
import { authModal } from '../components/authModal.js';

class ViewLoader {
    constructor() {
        this.views = [
            'explore',
            'feed',
            'chat',
            'map',
            'compare',
            'distance',
            'ai',
            'quiz',
            'saved',
            'country'
        ];
        this.protectedViews = new Set(['feed', 'chat']);
        this.cache = new Map();
        this.isLoaded = false;
    }

    /**
     * Preload and inject all view templates into #mainContent
     */
    async init() {
        const container = document.getElementById('mainContent');
        if (!container) return;

        try {
            const fetchPromises = this.views.map(async (name) => {
                try {
                    const res = await fetch(`views/${name}.html`);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const html = await res.text();
                    this.cache.set(name, html);
                    return { name, html };
                } catch (err) {
                    console.warn(`ViewLoader: Failed to load views/${name}.html:`, err.message);
                    return null;
                }
            });

            const results = await Promise.all(fetchPromises);

            // Clear container and append loaded sections
            container.innerHTML = '';
            results.forEach((item) => {
                if (item && item.html) {
                    container.insertAdjacentHTML('beforeend', item.html);
                }
            });

            this.isLoaded = true;
            console.log('✅ ViewLoader: All modular views loaded successfully.');
        } catch (e) {
            console.error('ViewLoader init error:', e);
        }
    }

    /**
     * Session Guard: checks whether a view is accessible by the current user
     * @param {string} viewId 
     * @returns {boolean}
     */
    canAccess(viewId) {
        if (!this.protectedViews.has(viewId)) return true;
        return !!supabaseService.user;
    }

    /**
     * Guard enforcement during navigation
     * @param {string} viewId 
     * @returns {string} Allowed tab ID (e.g. returns 'explore' if blocked)
     */
    guard(viewId) {
        if (this.canAccess(viewId)) {
            return viewId;
        }

        if (window.globalPulseApp?.showToast) {
            window.globalPulseApp.showToast('Please sign in to access Feed & Messenger! 🔒', 'info');
        }
        authModal.open('signin');
        return 'explore';
    }
}

export const viewLoader = new ViewLoader();
