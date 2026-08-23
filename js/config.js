/**
 * GlobalPulse — External Service Configuration
 *
 * SUPABASE SETUP (community location sharing):
 *   1. Create a free project at https://supabase.com
 *   2. Run supabase/schema.sql in the SQL Editor
 *   3. Copy your Project URL and anon public key below
 *      (Dashboard → Project Settings → API)
 *
 * The anon key is safe to expose in client code — data access is
 * protected by Row Level Security policies in supabase/schema.sql.
 */

const config = {
    supabase: {
        url: 'https://nswppvxwgjydntuhpqig.supabase.co', // e.g. 'https://abcdefghijk.supabase.co'
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zd3Bwdnh3Z2p5ZG50dWhwcWlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NDE0MDIsImV4cCI6MjEwMzAxNzQwMn0.mzRJxes_0mTm91dlnzlUKVSX7tZDuSGTwJ0VGC83w44' // e.g. 'eyJhbGciOiJIUzI1NiIsInR5cCI6...'
    }
};

/**
 * True when real credentials have been pasted in.
 * Keeps the app fully functional (minus community features) otherwise.
 */
export function isSupabaseConfigured() {
    return (
        typeof config.supabase.url === 'string' &&
        config.supabase.url.startsWith('https://') &&
        !config.supabase.url.includes('YOUR_SUPABASE') &&
        typeof config.supabase.anonKey === 'string' &&
        config.supabase.anonKey.length > 20 &&
        !config.supabase.anonKey.includes('YOUR_SUPABASE')
    );
}

export default config;
