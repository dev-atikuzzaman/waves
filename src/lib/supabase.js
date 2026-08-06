import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    '[Waves] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY পাওয়া যায়নি। ' +
    '.env ফাইলে (লোকালি) অথবা Vercel Project Settings > Environment Variables এ বসান।'
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: { eventsPerSecond: 10 }
  }
});
