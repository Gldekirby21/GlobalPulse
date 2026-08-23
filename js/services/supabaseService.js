/**
 * Supabase Service — Auth, Profiles & Live Community Locations
 * Requires the supabase-js UMD build loaded globally (window.supabase)
 * and credentials in js/config.js.
 *
 * Privacy model:
 *  - Sharing is opt-in; pausing deletes your row so nobody sees you.
 *  - 'city' precision rounds coordinates to a ~5 km grid before upload.
 *  - Others only ever see: username, avatar color, city/country, last seen.
 */

import config, { isSupabaseConfigured } from '../config.js';

const AVATAR_COLORS = [
    '#06b6d4', '#3b82f6', '#8b5cf6', '#10b981',
    '#f59e0b', '#f43f5e', '#ec4899', '#22d3ee'
];

const PRESENCE_WINDOW_MS = 2 * 60 * 1000; // "live" = seen in the last 2 min
const HEARTBEAT_MS = 30 * 1000;
const CITY_GRID_DEG = 0.05; // ~5.5 km

class SupabaseService {
    constructor() {
        this.client = null;
        this.user = null;
        this.profile = null;
        this.locationChannel = null;
        this.heartbeatTimer = null;
        this._coordsProvider = null; // () => { lat, lon, city, country, countryCode } | null
        this._onLocationsChange = null;
        this._onAuthChange = null;

        this.sharingEnabled = localStorage.getItem('globalpulse_sharing') !== 'false';
        this.precisionMode = localStorage.getItem('globalpulse_precision') || 'precise';

        if (isSupabaseConfigured() && window.supabase) {
            this.client = window.supabase.createClient(
                config.supabase.url,
                config.supabase.anonKey
            );
        } else if (isSupabaseConfigured()) {
            console.warn('Supabase credentials set, but the supabase-js CDN script is missing.');
        }
    }

    get configured() {
        return !!this.client;
    }

    /* ------------------------------------------------------------------ */
    /*  AUTH                                                              */
    /* ------------------------------------------------------------------ */

    /**
     * Restore session + listen for auth changes.
     * @param {(session: {user: Object, profile: Object} | null) => void} onAuthChange
     */
    async init(onAuthChange) {
        if (!this.configured) return null;
        this._onAuthChange = onAuthChange;

        const { data: { session } } = await this.client.auth.getSession();
        await this._handleSession(session);

        this.client.auth.onAuthStateChange(async (_event, session) => {
            await this._handleSession(session);
        });

        return this.user;
    }

    async _handleSession(session) {
        if (session?.user) {
            this.user = session.user;
            this.profile = await this.ensureProfile(this.user);
        } else {
            this.user = null;
            this.profile = null;
        }
        if (this._onAuthChange) {
            this._onAuthChange(this.user ? { user: this.user, profile: this.profile } : null);
        }
    }

    async checkUsernameAvailable(username) {
        if (!this.configured || !username) return true;
        const clean = username.trim();
        const { data, error } = await this.client
            .from('profiles')
            .select('id')
            .ilike('username', clean)
            .maybeSingle();

        if (error) {
            console.warn('Username check error:', error.message);
            return true;
        }
        return !data; // true if available, false if taken
    }

    async signUp(email, password, username) {
        const cleanEmail = email.toLowerCase().trim();
        const cleanUsername = username.trim();

        // 1. Double account security check on username
        const available = await this.checkUsernameAvailable(cleanUsername);
        if (!available) {
            throw new Error('USERNAME_TAKEN');
        }

        const { data, error } = await this.client.auth.signUp({
            email: cleanEmail,
            password,
            options: { data: { username: cleanUsername } }
        });
        if (error) throw error;
        // Profile row is created on first session via ensureProfile()
        return data;
    }

    async signIn(email, password) {
        const cleanEmail = email.toLowerCase().trim();
        const { data, error } = await this.client.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        return data;
    }

    async signInWithGoogle() {
        const redirectUrl = window.location.origin.includes('localhost')
            ? window.location.origin + '/'
            : 'https://global-pulse-lemon-two.vercel.app/';

        const { data, error } = await this.client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectUrl
            }
        });
        if (error) throw error;
        return data;
    }

    async signOut() {
        try {
            await this.stopSharing(); // remove public location row first
        } catch (e) {
            console.warn('Failed to remove location on signOut:', e);
        }
        this.stopHeartbeat();
        this.unsubscribeLocations();
        this.user = null;
        this.profile = null;
        if (this.client) {
            try {
                const { error } = await this.client.auth.signOut();
                if (error) console.warn('Supabase signOut error:', error.message);
            } catch (e) {
                console.warn('Auth signOut error:', e);
            }
        }
        if (this._onAuthChange) {
            this._onAuthChange(null);
        }
    }

    /**
     * Fetch the profile row, creating it on first login.
     * Username source: Google metadata → signup metadata → email prefix.
     */
    async ensureProfile(user) {
        const { data: existing } = await this.client
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (existing) return existing;

        const metaName =
            user.user_metadata?.username ||
            user.user_metadata?.name ||
            user.user_metadata?.full_name ||
            (user.email ? user.email.split('@')[0] : 'explorer');

        const baseName = String(metaName).replace(/\s+/g, '_').slice(0, 24) || 'explorer';

        // Retry with a numeric suffix if the username is taken (unique constraint)
        for (let attempt = 0; attempt < 4; attempt++) {
            const candidate = attempt === 0
                ? baseName
                : `${baseName}_${Math.floor(100 + Math.random() * 900)}`;

            const { data, error } = await this.client
                .from('profiles')
                .insert({
                    id: user.id,
                    username: candidate,
                    avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
                })
                .select()
                .single();

            if (!error) return data;
            if (error.code !== '23505') { // not a username conflict — surface it
                console.error('Profile creation failed:', error.message);
                return null;
            }
        }
        return null;
    }

    /* ------------------------------------------------------------------ */
    /*  LOCATION SHARING                                                  */
    /* ------------------------------------------------------------------ */

    /**
     * Provide the coordinate source used by publishLocation/heartbeat.
     * @param {() => ({lat:number, lon:number, city?:string, country?:string, countryCode?:string}) | null} provider
     */
    setCoordsProvider(provider) {
        this._coordsProvider = provider;
    }

    _roundForPrecision(lat, lon) {
        if (this.precisionMode !== 'city') return { lat, lon };
        const round = (v) => Math.round(v / CITY_GRID_DEG) * CITY_GRID_DEG;
        return { lat: round(lat), lon: round(lon) };
    }

    async publishLocation() {
        if (!this.configured || !this.user || !this.sharingEnabled) return false;
        const raw = this._coordsProvider?.();
        if (!raw || !Number.isFinite(raw.lat) || !Number.isFinite(raw.lon)) return false;

        const { lat, lon } = this._roundForPrecision(raw.lat, raw.lon);

        const { error } = await this.client
            .from('user_locations')
            .upsert({
                user_id: this.user.id,
                lat,
                lon,
                city: raw.city || null,
                country: raw.country || null,
                country_code: raw.countryCode || null,
                precision_mode: this.precisionMode,
                sharing_enabled: true,
                last_seen: new Date().toISOString()
            }, { onConflict: 'user_id' });

        if (error) {
            console.warn('Location publish failed:', error.message);
            return false;
        }
        return true;
    }

    /** Periodically refresh last_seen while the tab is visible. */
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.publishLocation();
            }
        }, HEARTBEAT_MS);
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /** Pause sharing — deletes the public row so you vanish for everyone. */
    async stopSharing() {
        this.sharingEnabled = false;
        localStorage.setItem('globalpulse_sharing', 'false');
        if (this.configured && this.user) {
            await this.client.from('user_locations').delete().eq('user_id', this.user.id);
        }
    }

    /** Resume sharing — republish immediately. */
    async startSharing() {
        this.sharingEnabled = true;
        localStorage.setItem('globalpulse_sharing', 'true');
        return this.publishLocation();
    }

    /** 'precise' | 'city' — takes effect on the next publish. */
    setPrecisionMode(mode) {
        this.precisionMode = mode === 'city' ? 'city' : 'precise';
        localStorage.setItem('globalpulse_precision', this.precisionMode);
        return this.publishLocation();
    }

    /* ------------------------------------------------------------------ */
    /*  COMMUNITY FEED                                                    */
    /* ------------------------------------------------------------------ */

    async fetchSharedLocations() {
        if (!this.configured) return [];

        const cutoff = new Date(Date.now() - PRESENCE_WINDOW_MS).toISOString();
        const { data, error } = await this.client
            .from('user_locations')
            .select('user_id, lat, lon, city, country, country_code, precision_mode, last_seen, profiles!inner ( username, avatar_color )')
            .eq('sharing_enabled', true)
            .gte('last_seen', cutoff);

        if (error) {
            console.warn('Fetching community locations failed:', error.message);
            return [];
        }
        return data || [];
    }

    /**
     * Live updates for the community map layer.
     * @param {(users: Array) => void} onChange — receives the full fresh list
     */
    subscribeToLocations(onChange) {
        if (!this.configured) return;
        this._onLocationsChange = onChange;

        const emit = async () => {
            const users = await this.fetchSharedLocations();
            if (this._onLocationsChange) this._onLocationsChange(users);
        };

        this.locationChannel = this.client
            .channel('globalpulse-locations')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'user_locations' }, emit)
            .subscribe();

        emit(); // initial load
    }

    unsubscribeLocations() {
        if (this.locationChannel) {
            this.client.removeChannel(this.locationChannel);
            this.locationChannel = null;
        }
        this._onLocationsChange = null;
    }
}

export const supabaseService = new SupabaseService();
