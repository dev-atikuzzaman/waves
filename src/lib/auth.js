import { supabase } from './supabase.js';

/** Google একাউন্ট দিয়ে এক-ক্লিকে সাইন-ইন/সাইন-আপ — কোনো কোড বা পাসওয়ার্ড লাগে না */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  if (error) throw error;
}

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

  // Google দিয়ে লগইন করলে user_metadata-তে নাম ও প্রোফাইল ছবি থাকে — সেটাই ব্যবহার করুন
  const meta = user.user_metadata || {};
  const fallbackName = meta.full_name || meta.name || (user.email || 'user').split('@')[0];
  const avatarUrl =
    meta.avatar_url ||
    meta.picture ||
    `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(fallbackName)}`;

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email,
      display_name: fallbackName,
      avatar_url: avatarUrl,
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
