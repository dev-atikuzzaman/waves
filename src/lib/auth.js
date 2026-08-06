import { supabase } from './supabase.js';

/** পাসওয়ার্ড ছাড়াই ইমেইলে ৬-সংখ্যার OTP কোড পাঠায় */
export async function sendOtp(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true }
  });
  if (error) throw error;
}

/** ইউজারের দেওয়া OTP কোড যাচাই করে সেশন তৈরি করে */
export async function verifyOtp(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email'
  });
  if (error) throw error;
  return data.session;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signOut() {
  await supabase.auth.signOut();
}

/** profiles টেবিলে নিজের রো নিশ্চিত করে (প্রথম লগইনে) */
export async function ensureProfile(user) {
  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existing) return existing;

  const fallbackName = (user.email || 'user').split('@')[0];
  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email,
      display_name: fallbackName,
      avatar_url: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(fallbackName)}`,
      is_online: true,
      last_seen: new Date().toISOString()
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setOnlineStatus(userId, isOnline) {
  await supabase
    .from('profiles')
    .update({ is_online: isOnline, last_seen: new Date().toISOString() })
    .eq('id', userId);
}
