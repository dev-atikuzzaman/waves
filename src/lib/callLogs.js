import { supabase } from './supabase.js';

/** নতুন কল লগ তৈরি করুন (কল শুরু হওয়ার সাথে সাথে, status='missed' দিয়ে শুরু) */
export async function createCallLog({ chatId, callerId, isVideo, isGroup }) {
  const { data, error } = await supabase
    .from('call_logs')
    .insert({
      chat_id: chatId,
      caller_id: callerId,
      is_video: isVideo,
      is_group: isGroup,
      status: 'missed'
    })
    .select()
    .single();
  if (error) {
    console.warn('createCallLog failed', error);
    return null;
  }
  return data.id;
}

/** কল উত্তর দেওয়া হলে status আপডেট করুন */
export async function markCallAnswered(callId) {
  if (!callId) return;
  await supabase.from('call_logs').update({ status: 'answered' }).eq('id', callId).eq('status', 'missed');
}

/** কল শেষ হলে status + duration সেভ করুন */
export async function endCallLog(callId, status, durationSeconds) {
  if (!callId) return;
  await supabase
    .from('call_logs')
    .update({ status, ended_at: new Date().toISOString(), duration_seconds: durationSeconds })
    .eq('id', callId);
}

export async function addCallParticipant(callId, userId) {
  if (!callId) return;
  await supabase.from('call_participants').upsert({ call_id: callId, user_id: userId }, { onConflict: 'call_id,user_id' });
}

export async function markParticipantJoined(callId, userId) {
  if (!callId) return;
  await supabase
    .from('call_participants')
    .upsert({ call_id: callId, user_id: userId, joined_at: new Date().toISOString() }, { onConflict: 'call_id,user_id' });
}

export async function markParticipantLeft(callId, userId) {
  if (!callId) return;
  await supabase.from('call_participants').update({ left_at: new Date().toISOString() }).eq('call_id', callId).eq('user_id', userId);
}

/** সাম্প্রতিক কল হিস্ট্রি লোড করুন (আমি caller বা participant যেখানেই) */
export async function loadCallHistory(myId, limit = 50) {
  const { data: asCaller, error: e1 } = await supabase
    .from('call_logs')
    .select('*, call_participants(user_id, profiles:user_id(id, display_name, avatar_url))')
    .eq('caller_id', myId)
    .order('started_at', { ascending: false })
    .limit(limit);

  const { data: asParticipant, error: e2 } = await supabase
    .from('call_participants')
    .select('call_logs(*, call_participants(user_id, profiles:user_id(id, display_name, avatar_url)))')
    .eq('user_id', myId)
    .order('joined_at', { ascending: false })
    .limit(limit);

  if (e1) console.warn(e1);
  if (e2) console.warn(e2);

  const fromCaller = (asCaller || []).map((c) => ({ ...c, iCalled: true }));
  const fromParticipant = (asParticipant || [])
    .map((r) => r.call_logs)
    .filter(Boolean)
    .map((c) => ({ ...c, iCalled: false }));

  const merged = new Map();
  [...fromCaller, ...fromParticipant].forEach((c) => merged.set(c.id, c));

  return [...merged.values()].sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).slice(0, limit);
}

/** কল লগ রিয়েলটাইমে সাবস্ক্রাইব করুন (নতুন/আপডেটেড কল লগ) */
export function subscribeToCallLogs(myId, onChange) {
  const channel = supabase
    .channel(`call-logs:${myId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs' }, (payload) => onChange(payload))
    .subscribe();
  return () => supabase.removeChannel(channel);
}
