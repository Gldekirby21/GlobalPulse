/**
 * Auth Modal & Account Chip
 * Login/signup UI (email-password + Google) and the header account
 * dropdown controlling location sharing preferences.
 */

import { supabaseService } from '../services/supabaseService.js';

class AuthModal {
    constructor() {
        this.onAuthStateChanged = null; // (session | null) => void
        this.onSharingChanged = null;   // () => void
    }

    init() {
        this.modal = document.getElementById('authModal');
        this.signInBtn = document.getElementById('signInBtn');
        this.accountChipWrap = document.getElementById('accountChipWrap');

        if (!this.modal || !this.signInBtn) return;

        // --- Modal controls ---
        this.signInBtn.addEventListener('click', () => this.open('signin'));
        document.getElementById('authModalClose')?.addEventListener('click', () => this.close());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.modal.hidden) this.close();
        });

        // --- Tabs ---
        const tabIn = document.getElementById('authTabSignIn');
        const tabUp = document.getElementById('authTabSignUp');
        tabIn?.addEventListener('click', () => this.switchTab('signin'));
        tabUp?.addEventListener('click', () => this.switchTab('signup'));

        // --- Forms ---
        document.getElementById('signInForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSignIn();
        });

        document.getElementById('signUpForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSignUp();
        });

        document.getElementById('googleSignInBtn')?.addEventListener('click', () => {
            supabaseService.signInWithGoogle().catch((err) => this.showError(err.message));
        });

        // --- Account dropdown (delegated — chip is re-rendered dynamically) ---
        this.accountChipWrap?.addEventListener('click', (e) => {
            const target = e.target.closest('[data-account-action]');
            if (!target) return;
            this.handleAccountAction(target.dataset.accountAction, target);
        });

        document.addEventListener('click', (e) => {
            if (this.accountChipWrap && !this.accountChipWrap.contains(e.target)) {
                document.getElementById('accountMenu')?.classList.remove('open');
            }
        });
    }

    /* ------------------------------ Modal ------------------------------ */

    open(tab = 'signin') {
        if (!supabaseService.configured) {
            alert(
                'Community features are not configured yet.\n\n' +
                'Create a free Supabase project and paste your URL + anon key into js/config.js ' +
                '(see README → Community Location Sharing).'
            );
            return;
        }
        this.switchTab(tab);
        this.showError('');
        this.modal.hidden = false;
        requestAnimationFrame(() => this.modal.classList.add('open'));
    }

    close() {
        this.modal.classList.remove('open');
        setTimeout(() => { this.modal.hidden = true; }, 250);
    }

    switchTab(tab) {
        const isSignin = tab === 'signin';
        document.getElementById('authTabSignIn')?.classList.toggle('active', isSignin);
        document.getElementById('authTabSignUp')?.classList.toggle('active', !isSignin);
        const inForm = document.getElementById('signInForm');
        const upForm = document.getElementById('signUpForm');
        if (inForm) inForm.hidden = !isSignin;
        if (upForm) upForm.hidden = isSignin;
        this.showError('');
    }

    showError(message) {
        const box = document.getElementById('authError');
        if (!box) return;
        box.textContent = message || '';
        box.style.display = message ? 'block' : 'none';
    }

    setLoading(loading) {
        document.querySelectorAll('#authModal button[type="submit"]').forEach(btn => {
            btn.disabled = loading;
        });
    }

    async handleSignIn() {
        const email = document.getElementById('signInEmail')?.value.trim();
        const password = document.getElementById('signInPassword')?.value;
        if (!email || !password) return this.showError('Please fill in all fields.');

        this.setLoading(true);
        try {
            await supabaseService.signIn(email, password);
            this.close(); // onAuthStateChange drives the rest
        } catch (err) {
            this.showError(this.friendlyError(err));
        } finally {
            this.setLoading(false);
        }
    }

    async handleSignUp() {
        const username = document.getElementById('signUpUsername')?.value.trim();
        const email = document.getElementById('signUpEmail')?.value.trim();
        const password = document.getElementById('signUpPassword')?.value;
        const confirm = document.getElementById('signUpPassword2')?.value;

        if (!username || !email || !password) return this.showError('Please fill in all fields.');
        if (password.length < 6) return this.showError('Password must be at least 6 characters.');
        if (password !== confirm) return this.showError('Passwords do not match.');

        this.setLoading(true);
        try {
            const { session, user } = await supabaseService.signUp(email, password, username);
            if (session) {
                this.close(); // auto-signed-in (email confirmation disabled)
            } else if (user && user.identities && user.identities.length === 0) {
                // Supabase security feature: returns empty identities array if email already exists
                this.switchTab('signin');
                const inEmail = document.getElementById('signInEmail');
                if (inEmail) inEmail.value = email;
                this.showError('🛑 Bawal ang double account: May existing account na ang email na ito. Pakisubukang mag-Sign In gamit ang iyong password o i-click ang "Continue with Google".');
            } else {
                this.showError('Account created! Check your email to confirm, then sign in.');
                this.switchTab('signin');
            }
        } catch (err) {
            const errText = err?.message || '';
            if (errText === 'USERNAME_TAKEN') {
                this.showError('⚠️ Ang display name na ito ay gamit na ng ibang explorer. Pumili ng ibang pangalan.');
            } else if (/already registered|already exists|duplicate|unique/i.test(errText)) {
                this.switchTab('signin');
                const inEmail = document.getElementById('signInEmail');
                if (inEmail) inEmail.value = email;
                this.showError('🛑 Bawal ang double account: May existing account na ang email na ito. Pakisubukang mag-Sign In gamit ang iyong password o i-click ang "Continue with Google".');
            } else {
                this.showError(this.friendlyError(err));
            }
        } finally {
            this.setLoading(false);
        }
    }

    friendlyError(err) {
        const msg = err?.message || 'Something went wrong.';
        if (/rate limit|too many requests|429/i.test(msg)) {
            return '⏳ Rate limit: Masyadong mabilis ang sign up attempts. Maghintay muna ng ilang sandali (o i-disable ang "Confirm email" sa Supabase Auth Settings).';
        }
        if (/email not confirmed/i.test(msg)) {
            return '✉️ Hindi pa nakukumpirma ang iyong email. Pakitingnan ang iyong inbox o i-disable ang "Confirm email" sa Supabase Dashboard.';
        }
        if (/invalid login|invalid credentials/i.test(msg)) return 'Invalid email or password. Kung nag-sign up ka gamit ang Google, gamitin ang "Continue with Google" button.';
        if (/already registered|already exists/i.test(msg)) return '🛑 Bawal ang double account: May account na ang email na ito — subukang mag-sign in.';
        if (/at least 6/i.test(msg)) return 'Password must be at least 6 characters.';
        return msg;
    }

    /* --------------------------- Header state --------------------------- */

    /**
     * Re-render the header auth area for the current session.
     * @param {{user: Object, profile: Object} | null} session
     */
    renderAuthArea(session) {
        if (!this.signInBtn || !this.accountChipWrap) return;

        if (!session || !session.user) {
            this.signInBtn.hidden = false;
            this.signInBtn.style.display = 'inline-flex';
            this.accountChipWrap.innerHTML = '';
            this.accountChipWrap.hidden = true;
            this.accountChipWrap.style.display = 'none';
            return;
        }

        const { profile } = session;
        const name = profile?.username || 'Explorer';
        const color = profile?.avatar_color || '#06b6d4';
        const initial = name.charAt(0).toUpperCase();

        // Hide Sign In button completely when user is logged in
        this.signInBtn.hidden = true;
        this.signInBtn.style.display = 'none';

        // Show Account Chip Menu
        this.accountChipWrap.hidden = false;
        this.accountChipWrap.style.display = 'block';
        this.accountChipWrap.innerHTML = `
      <button class="account-chip" id="accountChip" title="Account">
        <span class="avatar-dot" style="--avatar:${color}">${initial}</span>
        <span class="account-name">${name}</span>
        <i class="fa-solid fa-chevron-down"></i>
      </button>
      <div class="account-menu" id="accountMenu">
        <div class="menu-section-title">
          <i class="fa-solid fa-tower-broadcast"></i> Location Sharing
        </div>
        <label class="menu-toggle-row">
          <span>${supabaseService.sharingEnabled ? 'Visible to community' : 'Hidden from community'}</span>
          <input type="checkbox" id="sharingToggle" data-account-action="toggle-sharing"
            ${supabaseService.sharingEnabled ? 'checked' : ''} />
        </label>
        <div class="menu-section-title">
          <i class="fa-solid fa-crosshairs"></i> Precision
        </div>
        <div class="precision-segment">
          <button data-account-action="precision" data-mode="precise"
            class="${supabaseService.precisionMode === 'precise' ? 'active' : ''}">Exact GPS</button>
          <button data-account-action="precision" data-mode="city"
            class="${supabaseService.precisionMode === 'city' ? 'active' : ''}">City only</button>
        </div>
        <hr />
        <button class="menu-signout" data-account-action="signout">
          <i class="fa-solid fa-right-from-bracket"></i> Sign Out
        </button>
      </div>
    `;
    }

    handleAccountAction(action, el) {
        if (action === 'toggle-sharing') {
            const task = el.checked ? supabaseService.startSharing() : supabaseService.stopSharing();
            task.then(() => this.onSharingChanged?.()).catch(console.warn);
            return;
        }

        if (action === 'precision') {
            supabaseService.setPrecisionMode(el.dataset.mode)
                .then(() => this.onSharingChanged?.())
                .catch(console.warn);
            this.renderAuthArea(supabaseService.user ? { user: supabaseService.user, profile: supabaseService.profile } : null);
            return;
        }

        if (action === 'signout') {
            supabaseService.signOut()
                .then(() => this.onSharingChanged?.())
                .catch((err) => console.warn('Sign out failed:', err.message));
            return;
        }

        // Default: open/close the dropdown menu
        document.getElementById('accountMenu')?.classList.toggle('open');
    }
}

export const authModal = new AuthModal();
