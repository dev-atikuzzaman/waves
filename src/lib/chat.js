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

/** আমার সব চ্যাট (সর্বশেষ মেসেজ + পিয়ার প্রোফাইল + আনরিড কাউন্টসহ) লোড করুন */
export async function loadMyChats(myId) {
  const { data, error } = await supabase
    .from('chat_members')
    .select(`
      chat_id,
      chats:chat_id (
        id, is_group, name, updated_at,
        chat_members ( user_id, profiles:user_id ( id, display_name, avatar_url, is_online, last_seen ) ),
        messages ( id, body, kind, sender_id, created_at, deleted_at )
      )
    `)
    .eq('user_id', myId);
  if (error) throw error;

  const chats = (data || [])
    .map((row) => row.chats)
    .filter(Boolean)
    .map((chat) => {
      const members = chat.chat_members.map((m) => m.profiles).filter(Boolean);
      const peer = chat.is_group ? null : members.find((p) => p.id !== myId);
      const sortedMsgs = [...chat.messages].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const lastMsg = sortedMsgs[0];
      // অন্যরা পাঠানো (আমার নিজের না) এবং ডিলিট হয়নি এমন মেসেজের আইডি — আনরিড গণনার জন্য
      const otherMsgIds = sortedMsgs.filter((m) => m.sender_id !== myId && !m.deleted_at).map((m) => m.id);
      return { id: chat.id, isGroup: chat.is_group, name: chat.name, members, peer, lastMsg, otherMsgIds };
    });

  // সব চ্যাটের "অন্যের পাঠানো" মেসেজ আইডি একসাথে নিয়ে এক কোয়েরিতে আমার seen রিসিপ্ট চেক করুন
  const allOtherMsgIds = chats.flatMap((c) => c.otherMsgIds);
  let seenSet = new Set();
  if (allOtherMsgIds.length) {
    const { data: receipts } = await supabase
      .from('message_receipts')
      .select('message_id')
      .eq('user_id', myId)
      .not('seen_at', 'is', null)
      .in('message_id', allOtherMsgIds);
    seenSet = new Set((receipts || []).map((r) => r.message_id));
  }

  return chats
    .map((chat) => {
      const unreadCount = chat.otherMsgIds.filter((id) => !seenSet.has(id)).length;
      const { otherMsgIds, ...rest } = chat;
      return { ...rest, unreadCount };
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

/** নতুন গ্রুপ চ্যাট তৈরি করুন (একাধিক সদস্যসহ — গ্রুপ কল/গ্রুপ চ্যাট উভয়ের ভিত্তি) */
export async function createGroupChat(myId, memberIds, name) {
  const { data: chat, error: chatErr } = await supabase
    .from('chats')
    .insert({ is_group: true, name, created_by: myId })
    .select()
    .single();
  if (chatErr) throw chatErr;

  const rows = [myId, ...memberIds.filter((id) => id !== myId)].map((user_id) => ({ chat_id: chat.id, user_id }));
  const { error: memErr } = await supabase.from('chat_members').insert(rows);
  if (memErr) throw memErr;

  return chat.id;
}

export async function loadMessages(chatId, limit = 100) {
  const { data, error } = await supabase
    .from('messages')
    .select('*, reply_to:reply_to_id(id, body, sender_id, kind, deleted_at)')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;

  const ids = data.map((m) => m.id);
  const [{ data: reactions }, { data: receipts }] = await Promise.all([
    ids.length
      ? supabase.from('message_reactions').select('*').in('message_id', ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from('message_receipts').select('*').in('message_id', ids)
      : Promise.resolve({ data: [] })
  ]);

  return data.map((m) => ({
    ...m,
    reactions: (reactions || []).filter((r) => r.message_id === m.id),
    receipts: (receipts || []).filter((r) => r.message_id === m.id)
  }));
}

export async function sendMessage(chatId, senderId, body, { replyToId = null, kind = 'text' } = {}) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ chat_id: chatId, sender_id: senderId, body, kind, reply_to_id: replyToId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** ভয়েস নোট বা ফাইল/ইমেজ পাঠান — প্রথমে Supabase Storage-এ আপলোড, তারপর মেসেজ রো তৈরি */
export async function sendAttachmentMessage(chatId, senderId, file, { kind, replyToId = null, durationSeconds = null } = {}) {
  const ext = file.name?.split('.').pop() || (kind === 'voice' ? 'webm' : 'bin');
  const path = `${senderId}/${chatId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadErr } = await supabase.storage.from('attachments').upload(path, file, {
    contentType: file.type || undefined,
    upsert: false
  });
  if (uploadErr) throw uploadErr;

  const { data: pub } = supabase.storage.from('attachments').getPublicUrl(path);

  const { data, error } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      sender_id: senderId,
      body: kind === 'voice' ? 'ভয়েস মেসেজ' : file.name || 'ফাইল',
      kind,
      attachment_url: pub.publicUrl,
      attachment_name: file.name || null,
      attachment_size: file.size || null,
      attachment_duration: durationSeconds,
      reply_to_id: replyToId
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** একটা বিদ্যমান মেসেজ এক বা একাধিক চ্যাটে ফরওয়ার্ড করুন। অ্যাটাচমেন্ট থাকলে সেটা
 *  আবার আপলোড করা হয় না — একই attachment_url পুনর্ব্যবহার করা হয় (দ্রুত ও কম স্টোরেজ খরচ)।
 *  ফরওয়ার্ড করা মেসেজ মূল মেসেজের reply/edit ইতিহাস বহন করে না, শুধু কনটেন্ট বহন করে,
 *  এবং forwarded=true দিয়ে চিহ্নিত থাকে যাতে UI-তে "ফরওয়ার্ড করা হয়েছে" লেবেল দেখানো যায়। */
export async function forwardMessage(message, targetChatIds, senderId) {
  const rows = targetChatIds.map((chat_id) => ({
    chat_id,
    sender_id: senderId,
    body: message.body,
    kind: message.kind || 'text',
    attachment_url: message.attachment_url || null,
    attachment_name: message.attachment_name || null,
    attachment_size: message.attachment_size || null,
    attachment_duration: message.attachment_duration || null,
    forwarded: true
  }));

  const { data, error } = await supabase.from('messages').insert(rows).select();
  if (error) throw error;
  return data;
}

export async function editMessage(messageId, newBody) {
  const { error } = await supabase
    .from('messages')
    .update({ body: newBody, edited_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw error;
}

/** সফট-ডিলিট — বডি মুছে দেওয়া হয়, রো থেকে যায় যাতে "এই মেসেজটি মুছে ফেলা হয়েছে" দেখানো যায় */
export async function deleteMessage(messageId) {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString(), body: '', attachment_url: null })
    .eq('id', messageId);
  if (error) throw error;
}

/** রিয়েকশন টগল করুন — একই ইমোজিতে আবার ট্যাপ করলে সরে যাবে, ভিন্ন ইমোজি দিলে বদলে যাবে */
export async function toggleReaction(messageId, userId, emoji) {
  const { data: existing } = await supabase
    .from('message_reactions')
    .select('*')
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing && existing.emoji === emoji) {
    await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', userId);
    return null;
  }
  const { error } = await supabase
    .from('message_reactions')
    .upsert({ message_id: messageId, user_id: userId, emoji }, { onConflict: 'message_id,user_id' });
  if (error) throw error;
  return emoji;
}

/** মেসেজগুলো "delivered" হিসেবে মার্ক করুন (মেসেজ দেখানোর সাথে সাথে) */
export async function markDelivered(messageIds, userId) {
  if (!messageIds.length) return;
  const rows = messageIds.map((message_id) => ({ message_id, user_id: userId, delivered_at: new Date().toISOString() }));
  await supabase.from('message_receipts').upsert(rows, { onConflict: 'message_id,user_id' });
}

/** মেসেজগুলো "seen" হিসেবে মার্ক করুন (চ্যাট খোলা/স্ক্রল করার সাথে সাথে) */
export async function markSeen(messageIds, userId) {
  if (!messageIds.length) return;
  const rows = messageIds.map((message_id) => ({
    message_id,
    user_id: userId,
    delivered_at: new Date().toISOString(),
    seen_at: new Date().toISOString()
  }));
  await supabase.from('message_receipts').upsert(rows, { onConflict: 'message_id,user_id' });
}

/** নির্দিষ্ট চ্যাটের নতুন মেসেজ, এডিট, রিয়েকশন, রিসিপ্টে রিয়েলটাইম সাবস্ক্রাইব করুন */
export function subscribeToMessages(chatId, { onInsert, onUpdate }) {
  const channel = supabase
    .channel(`messages:${chatId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
      (payload) => onInsert?.(payload.new)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
      (payload) => onUpdate?.(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToReactions(chatId, onChange) {
  const channel = supabase
    .channel(`reactions:${chatId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload) => onChange(payload))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export function subscribeToReceipts(chatId, onChange) {
  const channel = supabase
    .channel(`receipts:${chatId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_receipts' }, (payload) => onChange(payload))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/** টাইপিং ইন্ডিকেটর — DB-তে সেভ হয় না, শুধু broadcast (হালকা ও দ্রুত) */
export function subscribeToTyping(chatId, onTyping) {
  const channel = supabase
    .channel(`typing:${chatId}`)
    .on('broadcast', { event: 'typing' }, ({ payload }) => onTyping(payload))
    .subscribe();
  return channel;
}

export function sendTyping(channel, userId, isTyping) {
  channel?.send({ type: 'broadcast', event: 'typing', payload: { userId, isTyping } });
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
