/**
 * Gamification Service — XP, Levels, Badges & Leaderboard
 * Backed by Supabase (profiles.xp / profiles.badges / quiz_scores).
 * All methods degrade gracefully when Supabase is not configured/logged out.
 */

import { supabaseService } from './supabaseService.js';

export const LEVELS = [
    { name: 'Explorer', min: 0 },
    { name: 'Navigator', min: 250 },
    { name: 'Cartographer', min: 750 },
    { name: 'Globetrotter', min: 2000 },
    { name: 'Legend', min: 5000 }
];

export const BADGES = {
    first_login: { icon: 'fa-shoe-prints', label: 'First Steps' },
    quiz_first_round: { icon: 'fa-brain', label: 'Quiz Rookie' },
    quiz_500: { icon: 'fa-medal', label: 'High Scorer' },
    visited_5: { icon: 'fa-passport', label: 'Wanderer' },
    visited_25: { icon: 'fa-earth-americas', label: 'Junior Globetrotter' },
    chatty: { icon: 'fa-comments', label: 'Social Butterfly' },
    globetrotter_1000km: { icon: 'fa-route', label: 'Long Hauler' }
};

export const gamificationBadges = BADGES;

class GamificationService {
    get ready() {
        return supabaseService.configured && !!supabaseService.user;
    }

    /** Level info for an XP amount: { index, name, next, progress (0-1), xpIntoLevel, xpForNext } */
    levelFor(xp = 0) {
        let index = 0;
        for (let i = 0; i < LEVELS.length; i++) {
            if (xp >= LEVELS[i].min) index = i;
        }
        const current = LEVELS[index];
        const next = LEVELS[index + 1] || null;
        const span = next ? next.min - current.min : 1;
        const into = xp - current.min;
        return {
            index,
            name: current.name,
            next: next ? next.name : null,
            progress: next ? Math.min(1, into / span) : 1,
            xpIntoLevel: into,
            xpForNext: next ? span : null
        };
    }

    /** Add XP to the logged-in profile. Returns updated xp or null. */
    async awardXp(amount) {
        if (!this.ready || !(amount > 0)) return null;

        const userId = supabaseService.user.id;
        const { data: prof } = await supabaseService.client
            .from('profiles')
            .select('xp')
            .eq('id', userId)
            .single();

        const newXp = (prof?.xp || 0) + Math.round(amount);
        await supabaseService.client
            .from('profiles')
            .update({ xp: newXp })
            .eq('id', userId);

        // Keep local cache fresh for UI re-renders
        if (supabaseService.profile) supabaseService.profile.xp = newXp;
        return newXp;
    }

    /**
     * Grant a badge if not yet owned.
     * @returns {boolean} true when newly granted (caller may show a toast-free celebration)
     */
    async grantBadge(key) {
        if (!this.ready || !BADGES[key]) return false;

        const userId = supabaseService.user.id;
        const { data: prof } = await supabaseService.client
            .from('profiles')
            .select('badges')
            .eq('id', userId)
            .single();

        const owned = Array.isArray(prof?.badges) ? prof.badges : [];
        if (owned.includes(key)) return false;

        const updated = [...owned, key];
        await supabaseService.client
            .from('profiles')
            .update({ badges: updated })
            .eq('id', userId);

        if (supabaseService.profile) supabaseService.profile.badges = updated;
        return true;
    }

    /** Submit a finished quiz round: persists score, awards XP + badges. */
    async submitQuizScore(score, correct, total) {
        if (!this.ready) return null;

        const { error } = await supabaseService.client
            .from('quiz_scores')
            .insert({ user_id: supabaseService.user.id, score, correct, total });
        if (error) {
            console.warn('Quiz score submit failed:', error.message);
            return null;
        }

        await this.awardXp(score / 10);
        await this.grantBadge('first_login');
        await this.grantBadge('quiz_first_round');
        if (score >= 500) await this.grantBadge('quiz_500');
        return true;
    }

    /**
     * Top leaderboard — best score per explorer.
     * @returns {Array<{user_id, username, avatar_color, best_score, xp}>}
     */
    async fetchLeaderboard(limit = 20) {
        if (!supabaseService.configured) return [];

        const { data, error } = await supabaseService.client
            .from('quiz_scores')
            .select('user_id, score, profiles!inner ( username, avatar_color, xp )')
            .order('score', { ascending: false })
            .limit(300);

        if (error) {
            console.warn('Leaderboard fetch failed:', error.message);
            return [];
        }

        const best = new Map();
        for (const row of data || []) {
            if (!best.has(row.user_id)) {
                best.set(row.user_id, {
                    user_id: row.user_id,
                    username: row.profiles?.username || 'Explorer',
                    avatar_color: row.profiles?.avatar_color || '#06b6d4',
                    xp: row.profiles?.xp || 0,
                    best_score: row.score
                });
            }
            if (best.size >= limit) break;
        }
        return [...best.values()];
    }

    /** Subscribe to leaderboard changes (new rounds reshuffle rankings). */
    subscribeToLeaderboard(onChange) {
        if (!supabaseService.configured) return;
        const emit = () => this.fetchLeaderboard().then(onChange);
        this._lbChannel = supabaseService.client
            .channel('globalpulse-leaderboard')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_scores' }, emit)
            .subscribe();
        emit();
    }

    unsubscribeLeaderboard() {
        if (this._lbChannel && supabaseService.configured) {
            supabaseService.client.removeChannel(this._lbChannel);
            this._lbChannel = null;
        }
    }
}

export const gamificationService = new GamificationService();
