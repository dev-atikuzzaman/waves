import { supabase } from './supabase.js';

/** ইমেইল/নাম দিয়ে ব্যবহারকারী খুঁজুন (নিজেকে বাদ দিয়ে) */
export async function searchProfiles(query, myId) {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', myId)
    .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(10);
  if (error) throw error;
  return data;
}

/** আমার সব চ্যাট (সর্বশেষ মেসেজ + পিয়ার প্রোফাইলসহ) লোড করুন */
export async function loadMyChats(myId) {
  const { data, error } = await supabase
    .from('chat_members')
    .select(`
      chat_id,
      chats:chat_id (
        id, is_group, updated_at,
        chat_members ( user_id, profiles:user_id ( id, display_name, avatar_url, is_online, last_seen ) ),
        messages ( id, body, sender_id, created_at )
      )
    `)
    .eq('user_id', myId);
  if (error) throw error;

  return (data || [])
    .map((row) => row.chats)
    .filter(Boolean)
    .map((chat) => {
      const peer = chat.chat_members.map((m) => m.profiles).find((p) => p && p.id !== myId);
      const lastMsg = [...chat.messages].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      )[0];
      return { id: chat.id, peer, lastMsg };
    })
    .sort((a, b) => {
      const ta = a.lastMsg ? new Date(a.lastMsg.created_at) : 0;
      const tb = b.lastMsg ? new Date(b.lastMsg.created_at) : 0;
      return tb - ta;
    });
}

/** দুইজনের মধ্যে বিদ্যমান 1:1 চ্যাট থাকলে সেটা, নাহলে নতুন তৈরি করুন */
export async function getOrCreateDirectChat(myId, peerId) {
  const { data: mine } = await supabase
    .from('chat_members')
    .select('chat_id, chats!inner(is_group)')
    .eq('user_id', myId)
    .eq('chats.is_group', false);

  if (mine && mine.length) {
    for (const row of mine) {
      const { data: members } = await supabase
        .from('chat_members')
        .select('user_id')
        .eq('chat_id', row.chat_id);
      const ids = (members || []).map((m) => m.user_id);
      if (ids.includes(peerId) && ids.length === 2) {
        return row.chat_id;
      }
    }
  }

  const { data: chat, error: chatErr } = await supabase
    .from('chats')
    .insert({ is_group: false, created_by: myId })
    .select()
    .single();
  if (chatErr) throw chatErr;

  const { error: memErr } = await supabase
    .from('chat_members')
    .insert([
      { chat_id: chat.id, user_id: myId },
      { chat_id: chat.id, user_id: peerId }
    ]);
  if (memErr) throw memErr;

  return chat.id;
}

export async function loadMessages(chatId, limit = 100) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function sendMessage(chatId, senderId, body) {
  const { error } = await supabase.from('messages').insert({
    chat_id: chatId,
    sender_id: senderId,
    body
  });
  if (error) throw error;
}

/** নির্দিষ্ট চ্যাটের নতুন মেসেজে রিয়েলটাইম সাবস্ক্রাইব করুন */
export function subscribeToMessages(chatId, onInsert) {
  const channel = supabase
    .channel(`messages:${chatId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
      (payload) => onInsert(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/** প্রোফাইল টেবিলে অনলাইন/লাস্ট-সিন আপডেট রিয়েলটাইম শোনা */
export function subscribeToPresence(peerId, onChange) {
  const channel = supabase
    .channel(`presence:${peerId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${peerId}` },
      (payload) => onChange(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/** সব চ্যাটের ইনসার্ট শুনে সাইডবার লাইভ আপডেট করার জন্য */
export function subscribeToAllMyMessages(myChatIds, onInsert) {
  const channel = supabase
    .channel('all-messages')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        if (myChatIds.includes(payload.new.chat_id)) onInsert(payload.new);
      }
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
