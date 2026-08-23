/**
 * Access Gating Helpers — Guest vs Logged-in experience
 *
 * Guests always SEE what they're missing (lock overlays, teasers) but never
 * get the locked functionality. Real security remains in Supabase RLS.
 */

import { supabaseService } from '../services/supabaseService.js';
import { authModal } from '../components/authModal.js';

/** True when a Supabase session exists. */
export const isAuthenticated = () => !!(supabaseService.configured && supabaseService.user);

/** True when Supabase keys are present (community system available). */
export const isCommunityAvailable = () => supabaseService.configured;

/** Open the login/signup modal. */
export function openAuthPrompt(tab = 'signin') {
    authModal.open(tab);
}

/**
 * HTML for a lock overlay that covers a gated panel.
 * Wrap the panel content in a relatively-positioned container.
 */
export function lockOverlayHtml(text = 'Sign in to unlock this feature') {
    return `
    <div class="feature-locked">
      <div class="feature-locked-inner">
        <i class="fa-solid fa-lock"></i>
        <p>${text}</p>
        <button type="button" class="feature-unlock-btn" data-open-auth>
          <i class="fa-solid fa-right-to-bracket"></i> Sign In
        </button>
      </div>
    </div>`;
}

/**
 * Wire every [data-open-auth] trigger inside a container (call after render).
 */
export function bindAuthTriggers(root = document) {
    root.querySelectorAll('[data-open-auth]').forEach((btn) => {
        if (btn.dataset.authBound) return;
        btn.dataset.authBound = '1';
        btn.addEventListener('click', () => openAuthPrompt());
    });
}
