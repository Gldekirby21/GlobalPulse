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
import { ipService } from './ipService.js';

const AVATAR_COLORS = [
    '#06b6d4', '#3b82f6', '#8b5cf6', '#10b981',
    '#f59e0b', '#f43f5e', '#ec4899', '#22d3ee'
];

const PRESENCE_WINDOW_MS = 2 * 60 * 1000; // "live" = seen in the last 2 min
const HEARTBEAT_MS = 30 * 1000; // Live auto-sync presence & coordinates every 30 seconds
const CITY_GRID_DEG = 0.05; // ~5.5 km

const safeStorage = {
    getItem: (key) => {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    setItem: (key, value) => {
        try { localStorage.setItem(key, value); } catch (e) {}
    },
    removeItem: (key) => {
        try { localStorage.removeItem(key); } catch (e) {}
    }
};

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
        this._lastPublishedHash = null;
        this._lastPublishedTime = 0;

        this.sharingEnabled = safeStorage.getItem('globalpulse_sharing') !== 'false';
        this.precisionMode = safeStorage.getItem('globalpulse_precision') || 'precise';

        if (isSupabaseConfigured() && window.supabase) {
            this.client = window.supabase.createClient(
                config.supabase.url,
                config.supabase.anonKey,
                {
                    auth: {
                        storage: safeStorage,
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: true
                    }
                }
            );
        } else if (isSupabaseConfigured()) {
            console.warn('Supabase credentials set, but the supabase-js library is missing.');
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
            console.log('%c🔑 [Auth Session] User logged in: ' + (this.user.email || this.user.id) + ' — Triggering auto location save...', 'color: #38bdf8; font-weight: bold;');
            this.profile = await this.ensureProfile(this.user);
            // Automatically save user coordinates on every login / restored session
            await this.publishLocation(true);
            this.startHeartbeat();
        } else {
            this.user = null;
            this.profile = null;
            this.stopHeartbeat();
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
        if (!user) return null;
        try {
            console.log('👤 [ensureProfile] Checking profile for user ID:', user.id);
            const { data: existing, error: selectErr } = await this.client
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();

            if (selectErr) {
                console.error('❌ [ensureProfile] Select error:', selectErr.message);
            }

            if (existing) {
                console.log('👤 [ensureProfile] Found existing profile in cloud:', existing.username);
                return existing;
            }

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

                if (!error && data) {
                    console.log('👤 [ensureProfile] Successfully created profile in cloud:', data);
                    return data;
                }
                if (error && error.code !== '23505') { // not a username conflict — surface it
                    console.error('❌ [ensureProfile] Profile creation failed:', error.message, error);
                    return null;
                }
            }
        } catch (e) {
            console.error('❌ [ensureProfile] Exception:', e);
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

    async publishLocation(force = false) {
        console.log('📍 [publishLocation] Called (force=' + force + ', sharingEnabled=' + this.sharingEnabled + ', configured=' + this.configured + ')');

        if (!this.configured) {
            console.warn('📍 publishLocation: Supabase is not configured.');
            return false;
        }
        if (!this.user) {
            console.warn('📍 publishLocation: No authenticated user.');
            return false;
        }

        // Auto-enable sharing for authenticated users
        if (this.sharingEnabled === false) {
            this.sharingEnabled = true;
            try { localStorage.setItem('globalpulse_sharing', 'true'); } catch (e) { }
        }

        // 1. Get coordinates from provider or fallback directly to ipService
        let raw = this._coordsProvider?.();
        console.log('📍 [publishLocation] Coordinates from provider:', raw);

        if (!raw || !Number.isFinite(Number(raw.lat)) || !Number.isFinite(Number(raw.lon))) {
            console.log('📍 [publishLocation] Provider had no coords, detecting via ipService...');
            try {
                raw = await ipService.detectLocation();
                console.log('📍 [publishLocation] ipService detected:', raw);
            } catch (e) {
                console.warn('Fallback location detection error:', e);
            }
        }

        if (!raw || !Number.isFinite(Number(raw.lat)) || !Number.isFinite(Number(raw.lon))) {
            console.warn('📍 publishLocation: No valid coordinates found to save.');
            return false;
        }

        const rawLat = Number(raw.lat);
        const rawLon = Number(raw.lon);

        const { lat, lon } = this._roundForPrecision(rawLat, rawLon);
        const hash = `${lat.toFixed(4)}_${lon.toFixed(4)}_${raw.city || ''}_${this.precisionMode}`;
        const now = Date.now();

        // Throttle: don't re-upload if coordinates are unchanged and published recently (< 25s)
        if (!force && hash === this._lastPublishedHash && (now - this._lastPublishedTime < 25000)) {
            console.log('📍 [publishLocation] Throttled (unchanged coords recently published).');
            return true;
        }

        // 2. Ensure profile row exists in database (foreign key requirement)
        await this.ensureProfile(this.user);

        // 3. Upsert user location into Supabase
        const payload = {
            user_id: this.user.id,
            lat,
            lon,
            city: raw.city || null,
            country: raw.country || null,
            country_code: raw.countryCode || raw.country_code || null,
            precision_mode: this.precisionMode,
            sharing_enabled: true,
            last_seen: new Date().toISOString()
        };

        console.group('%c📍 [GlobalPulse Location Sync] Posting Coordinates to Supabase...', 'color: #06b6d4; font-weight: bold; font-size: 1.05em;');
        console.log('%c👤 User:', 'color: #3b82f6; font-weight: bold;', {
            id: this.user.id,
            email: this.user.email,
            username: this.profile?.username || 'Explorer'
        });
        console.log('%c🛰️ Coordinates Payload:', 'color: #10b981; font-weight: bold;', payload);
        console.groupEnd();

        const { data, error } = await this.client
            .from('user_locations')
            .upsert(payload, { onConflict: 'user_id' })
            .select();

        if (error) {
            console.group('%c❌ [GlobalPulse Location Sync] FAILED to Post Location to Supabase', 'color: #ef4444; font-weight: bold; font-size: 1.05em;');
            console.error('Error Code:', error.code);
            console.error('Error Message:', error.message);
            console.error('Error Details:', error.details || error.hint || error);
            console.groupEnd();

            if (error.code === '42P01' || error.message?.includes('does not exist')) {
                window.globalPulseApp?.showToast?.('Please run MASTER_SCHEMA.sql in Supabase SQL editor! ⚠️', 'warning');
            } else if (error.message?.includes('violates row-level security')) {
                window.globalPulseApp?.showToast?.('RLS blocked location save. Run MASTER_SCHEMA.sql in SQL editor! ⚠️', 'warning');
            }
            return false;
        }

        console.group('%c✅ [GlobalPulse Location Sync] POSTED TO SUPABASE SUCCESS!', 'color: #10b981; font-weight: bold; font-size: 1.05em;');
        console.log('%c📡 Database Table:', 'color: #8b5cf6; font-weight: bold;', 'public.user_locations');
        console.log('%c📦 Saved Record in Cloud:', 'color: #06b6d4; font-weight: bold;', data?.[0] || payload);
        console.log('%c🕒 Timestamp:', 'color: #f59e0b;', new Date().toLocaleTimeString());
        console.groupEnd();

        this._lastPublishedHash = hash;
        this._lastPublishedTime = now;
        return true;
    }

    /** Periodically auto-sync location coordinates every 30 seconds while logged in. */
    startHeartbeat() {
        this.stopHeartbeat();
        console.log('💓 [Location Heartbeat] 30-Second live location auto-sync is ACTIVE');
        this.heartbeatTimer = setInterval(async () => {
            if (this.user && this.sharingEnabled) {
                console.log('💓 [Location Heartbeat] 30s tick: Auto-updating location coordinates in Supabase...');
                await this.publishLocation(true);
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
            .select('user_id, lat, lon, city, country, country_code, precision_mode, last_seen, profiles!inner ( username, avatar_color, avatar_url, full_name )')
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
