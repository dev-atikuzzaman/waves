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

/** কোনো Postgres এরর RLS (row-level security) ভায়োলেশন কিনা চেক করে */
export function isRlsError(err) {
  return err?.code === '42501' || /row-level security/i.test(err?.message || '');
}

/** RLS এরর এলে — একবার সেশন রিফ্রেশ করে অপারেশনটা রিট্রাই করে।
 *
 *  কেন লাগে: ব্রাউজার ট্যাব (বিশেষত ল্যাপটপে) অনেকক্ষণ ব্যাকগ্রাউন্ডে/মিনিমাইজড থাকলে
 *  ব্রাউজার টাইমার থ্রটল করে, ফলে supabase-js-এর auto-refresh টাইমার সময়মতো না চলে
 *  access token এক্সপায়ার হয়ে যেতে পারে। এরপর ট্যাবে ফিরে এসে কিছু লিখতে (যেমন নতুন
 *  চ্যাট/কল তৈরি) গেলে এক্সপায়ার্ড টোকেন দিয়ে রিকোয়েস্ট যায়, আর Postgres-এর RLS পলিসি
 *  (auth.uid() = created_by) মেলে না — ফলে ব্যবহারকারী লগইন থাকা সত্ত্বেও একটা বিভ্রান্তিকর
 *  "row violates row-level security policy" এরর দেখে। রিফ্রেশ করে একবার রিট্রাই করলে এই
 *  কেসের সিংহভাগ নিজে থেকেই সেরে যায়, ব্যবহারকারীকে ম্যানুয়ালি লগআউট/লগইন করতে হয় না। */
export async function withSessionRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!isRlsError(err)) throw err;
    const { data, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr || !data?.session) {
      const wrapped = new Error('আপনার সেশনের মেয়াদ শেষ হয়ে গেছে। একবার লগআউট করে আবার লগইন করুন।');
      wrapped.name = 'SessionExpired';
      throw wrapped;
    }
    return await fn();
  }
}
