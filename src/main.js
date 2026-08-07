import { supabase } from './lib/supabase.js';
import { signInWithGoogle, sendOtp, verifyOtp, getSession, onAuthChange, signOut, ensureProfile, setOnlineStatus } from './lib/auth.js';
import {
  searchProfiles,
  loadMyChats,
  getOrCreateDirectChat,
  loadMessages,
  sendMessage,
  sendAttachmentMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  markDelivered,
  markSeen,
  subscribeToMessages,
  subscribeToReactions,
  subscribeToReceipts,
  subscribeToTyping,
  sendTyping,
  subscribeToPresence,
  subscribeToAllMyMessages
} from './lib/chat.js';
import { CallManager } from './lib/calls.js';
import { loadCallHistory } from './lib/callLogs.js';
import { VoiceRecorder } from './lib/voiceRecorder.js';
import { registerServiceWorker } from './lib/pwa.js';
import { enablePushNotifications, disablePushNotifications, getNotificationPermission } from './lib/push.js';
import { playMessagePing, startRingtone, stopRingtone, startOutgoingRingback, unlockAudioOnFirstInteraction } from './lib/sounds.js';
import { EMOJI_CATEGORIES } from './lib/emojiData.js';

registerServiceWorker();
unlockAudioOnFirstInteraction();

// নোটিফিকেশনে ট্যাপ করলে service worker postMessage পাঠায় — সঠিক চ্যাট খুলে দিন
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', async (event) => {
    const data = event.data || {};
    if (data.type !== 'notification-click' || !currentUser) return;
    if (data.chatId) {
      try {
        const chats = await loadMyChats(currentUser.id);
        const chat = chats.find((c) => c.id === data.chatId);
        if (chat) await openChat(chat.id, chat.peer, chat);
      } catch {
        // চ্যাট খুলতে ব্যর্থ হলে অন্তত অ্যাপ ফোকাসে থাকবে
      }
    }
  });
}

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);
const authScreen = $('auth-screen');
const mainScreen = $('main-screen');
const googleSigninBtn = $('google-signin-btn');
const authForm = $('auth-form');
const authEmail = $('auth-email');
const authOtp = $('auth-otp');
const otpRow = $('otp-row');
const authSubmit = $('auth-submit');
const authMsg = $('auth-msg');

const myAvatar = $('my-avatar');
const myName = $('my-name');
const logoutBtn = $('logout-btn');
const searchInput = $('search-input');
const chatListEl = $('chat-list');

const sidebar = $('sidebar');
const chatPane = $('chat-pane');
const emptyState = $('empty-state');
const activeChat = $('active-chat');
const backBtn = $('back-btn');
const peerAvatar = $('peer-avatar');
const peerName = $('peer-name');
const peerStatus = $('peer-status');
const messagesEl = $('messages');
const typingIndicator = $('typing-indicator');
const composer = $('composer');
const messageInput = $('message-input');
const voiceCallBtn = $('voice-call-btn');
const videoCallBtn = $('video-call-btn');
const attachBtn = $('attach-btn');
const fileInput = $('file-input');
const micRecordBtn = $('mic-record-btn');
const emojiBtn = $('emoji-btn');
const emojiPicker = $('emoji-picker');
const emojiSearch = $('emoji-search');
const emojiTabs = $('emoji-tabs');
const emojiGrid = $('emoji-grid');
const recordingBar = $('recording-bar');
const recordingTime = $('recording-time');
const recordingCancelBtn = $('recording-cancel-btn');
const recordingSendBtn = $('recording-send-btn');

const replyPreview = $('reply-preview');
const replyPreviewText = $('reply-preview-text');
const replyPreviewClose = $('reply-preview-close');
const editBanner = $('edit-banner');
const editBannerClose = $('edit-banner-close');

const callOverlay = $('call-overlay');
const callAvatar = $('call-avatar');
const callPeerName = $('call-peer-name');
const callStatus = $('call-status');
const videoGrid = $('video-grid');
const remoteVideo = $('remote-video');
const localVideo = $('local-video');
const remoteTilesEl = $('remote-tiles');
const remoteAudioEl = $('remote-audio');
const toggleMicBtn = $('toggle-mic-btn');
const toggleCamBtn = $('toggle-cam-btn');
const switchCamBtn = $('switch-cam-btn');
const speakerBtn = $('speaker-btn');
const endCallBtn = $('end-call-btn');

const incomingCallEl = $('incoming-call');
const incomingAvatar = $('incoming-avatar');
const incomingName = $('incoming-name');
const incomingType = $('incoming-type');
const acceptCallBtn = $('accept-call-btn');
const declineCallBtn = $('decline-call-btn');

const callHistoryBtn = $('call-history-btn');
const callHistoryPanel = $('call-history-panel');
const closeCallHistoryBtn = $('close-call-history-btn');
const callHistoryList = $('call-history-list');

const toastRoot = $('toast-root');

// ---------- state ----------
let currentUser = null;
let currentProfile = null;
let callManager = null;
let activeChatId = null;
let activePeer = null;
let activeChatMembers = []; // চ্যাটে থাকা সব সদস্যের প্রোফাইল (গ্রুপ কলের জন্য)
let unsubMessages = null;
let unsubPresence = null;
let unsubReactions = null;
let unsubReceipts = null;
let typingChannel = null;
let typingTimeout = null;
let messagesById = new Map();
let micOn = true;
let camOn = true;
let pendingEmailForOtp = '';
let replyingTo = null;
let editingMessageId = null;
let voiceRecorder = null;
let recordingInterval = null;
let openReactionPickerFor = null;
let unsubAllMessages = null;
let myChatIds = [];

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---------- Auth flow ----------
googleSigninBtn.addEventListener('click', async () => {
  googleSigninBtn.disabled = true;
  try {
    // Google-এর কনসেন্ট পেজে রিডাইরেক্ট করে — সফল হলে Google নিজেই আবার এই পেজে ফিরিয়ে
    // আনে এবং onAuthChange স্বয়ংক্রিয়ভাবে লগইন সম্পন্ন করে
    await signInWithGoogle();
  } catch (err) {
    authMsg.textContent = err.message || 'Google সাইন-ইন করা যায়নি';
    googleSigninBtn.disabled = false;
  }
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authSubmit.disabled = true;
  try {
    if (otpRow.classList.contains('hidden')) {
      pendingEmailForOtp = authEmail.value.trim();
      await sendOtp(pendingEmailForOtp);
      otpRow.classList.remove('hidden');
      authSubmit.textContent = 'কোড যাচাই করুন';
      authMsg.textContent = `${pendingEmailForOtp} এ একটা কোড পাঠানো হয়েছে`;
    } else {
      const code = authOtp.value.trim();
      await verifyOtp(pendingEmailForOtp, code);
      authMsg.textContent = '';
    }
  } catch (err) {
    authMsg.textContent = err.message || 'কিছু একটা ভুল হয়েছে';
  } finally {
    authSubmit.disabled = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  if (currentUser) {
    await setOnlineStatus(currentUser.id, false);
    await disablePushNotifications().catch(() => {});
  }
  await signOut();
});

onAuthChange(async (session) => {
  if (session?.user) {
    currentUser = session.user;
    currentProfile = await ensureProfile(currentUser);
    await setOnlineStatus(currentUser.id, true);
    showMain();
    initCallManager();
    await refreshChatList();
    maybePromptForNotifications();
  } else {
    currentUser = null;
    currentProfile = null;
    showAuth();
  }
});

/** লগইনের পর, ব্রাউজার সাপোর্ট করলে এবং আগে জিজ্ঞেস করা না থাকলে নোটিফিকেশন পারমিশন চান।
 *  এটাই "অ্যাপ ব্যাকগ্রাউন্ডে/বন্ধ থাকলে কল পপ-আপ না আসা" সমস্যার মূল সমাধান — অনুমতি
 *  ছাড়া ব্রাউজার কখনোই ব্যাকগ্রাউন্ডে নোটিফিকেশন দেখাতে পারবে না। */
async function maybePromptForNotifications() {
  const permission = getNotificationPermission();
  if (permission === 'unsupported' || permission === 'denied') return;
  if (permission === 'granted') {
    // ইতিমধ্যে অনুমতি আছে — সাবস্ক্রিপশন আপ-টু-ডেট আছে কিনা নিশ্চিত করুন (নীরবে, টোস্ট ছাড়া)
    await enablePushNotifications(currentUser.id).catch(() => {});
    return;
  }
  // এখনো জিজ্ঞেস করা হয়নি — একটা টোস্টের বদলে সরাসরি ব্রাউজার প্রম্পট দেখান
  const result = await enablePushNotifications(currentUser.id).catch(() => null);
  if (result?.granted) {
    toast('নোটিফিকেশন চালু হয়েছে — এখন থেকে অ্যাপ বন্ধ থাকলেও কল/মেসেজের নোটিফিকেশন পাবেন');
  } else if (result?.supported && !result.granted) {
    toast('নোটিফিকেশন অনুমতি ছাড়া অ্যাপ বন্ধ থাকলে কল/মেসেজের পপ-আপ আসবে না');
  }
}

(async () => {
  const session = await getSession();
  if (!session) showAuth();
})();

function showAuth() {
  authScreen.classList.remove('hidden');
  mainScreen.classList.add('hidden');
}

function showMain() {
  authScreen.classList.add('hidden');
  mainScreen.classList.remove('hidden');
  myAvatar.src = currentProfile.avatar_url;
  myName.textContent = currentProfile.display_name;
}

// ---------- Search / start new chat ----------
let searchDebounce;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(async () => {
    const q = searchInput.value.trim();
    if (!q) return refreshChatList();
    const results = await searchProfiles(q, currentUser.id);
    renderSearchResults(results);
  }, 250);
});

function renderSearchResults(results) {
  chatListEl.innerHTML = '';
  if (!results.length) {
    chatListEl.innerHTML = `<li class="empty-state" style="padding:24px;">কেউ পাওয়া যায়নি</li>`;
    return;
  }
  for (const profile of results) {
    const li = document.createElement('li');
    li.className = 'chat-item';
    li.innerHTML = `
      <div class="avatar-ring sm"><img class="avatar" src="${profile.avatar_url}" alt="" /></div>
      <div class="chat-item-body">
        <div class="chat-item-top"><strong>${escapeHtml(profile.display_name)}</strong></div>
        <div class="chat-item-preview">${escapeHtml(profile.email)}</div>
      </div>`;
    li.addEventListener('click', async () => {
      try {
        const chatId = await getOrCreateDirectChat(currentUser.id, profile.id);
        searchInput.value = '';
        await refreshChatList();
        openChat(chatId, profile);
      } catch (err) {
        toast(err.message || 'চ্যাট খুলতে সমস্যা হয়েছে');
      }
    });
    chatListEl.appendChild(li);
  }
}

// ---------- Chat list ----------
async function refreshChatList() {
  const chats = await loadMyChats(currentUser.id);
  myChatIds = chats.map((c) => c.id);
  ensureGlobalMessageSubscription();
  chatListEl.innerHTML = '';
  if (!chats.length) {
    chatListEl.innerHTML = `<li class="empty-state" style="padding:24px;">উপরে সার্চ করে কারও সাথে চ্যাট শুরু করুন</li>`;
    return;
  }
  for (const chat of chats) {
    if (!chat.isGroup && !chat.peer) continue;
    const li = document.createElement('li');
    li.className = 'chat-item' + (chat.id === activeChatId ? ' active' : '');
    const label = chat.isGroup ? (chat.name || 'গ্রুপ') : chat.peer.display_name;
    const avatarSrc = chat.isGroup
      ? `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(chat.name || chat.id)}`
      : chat.peer.avatar_url;
    let preview = 'কথোপকথন শুরু করুন';
    if (chat.lastMsg) {
      preview = chat.lastMsg.deleted_at
        ? 'এই মেসেজটি মুছে ফেলা হয়েছে'
        : chat.lastMsg.kind === 'voice'
        ? '🎤 ভয়েস মেসেজ'
        : chat.lastMsg.kind === 'image'
        ? '📷 ছবি'
        : chat.lastMsg.kind === 'file'
        ? '📎 ফাইল'
        : escapeHtml(chat.lastMsg.body);
    }
    const time = chat.lastMsg ? formatTime(chat.lastMsg.created_at) : '';
    li.innerHTML = `
      <div class="avatar-ring sm"><img class="avatar" src="${avatarSrc}" alt="" /></div>
      <div class="chat-item-body">
        <div class="chat-item-top">
          <strong>${escapeHtml(label)}</strong>
          <span class="chat-item-time">${time}</span>
        </div>
        <div class="chat-item-preview">${preview}</div>
      </div>`;
    li.addEventListener('click', async () => {
      try {
        await openChat(chat.id, chat.peer, chat);
      } catch (err) {
        toast(err.message || 'চ্যাট খুলতে সমস্যা হয়েছে');
      }
    });
    chatListEl.appendChild(li);
  }
}

/** আমার সব চ্যাটের নতুন মেসেজে সাবস্ক্রাইব করে রাখুন (ট্যাব খোলা থাকলে) — যাতে বর্তমানে
 *  খোলা নেই এমন চ্যাটে মেসেজ এলেও সাউন্ড/টোস্ট দিয়ে জানানো যায়। "অ্যাপের ভিতরে থাকলে
 *  নোটিফিকেশন সাউন্ড না আসা" সমস্যার একটা অংশ এটা দিয়ে সমাধান হয়; ট্যাব সম্পূর্ণ
 *  ব্যাকগ্রাউন্ডে/বন্ধ থাকলে সেটা Web Push (push.js) দিয়ে হ্যান্ডল হয়। */
function ensureGlobalMessageSubscription() {
  unsubAllMessages?.();
  unsubAllMessages = subscribeToAllMyMessages(myChatIds, (msg) => {
    if (msg.sender_id === currentUser.id) return;
    if (msg.chat_id === activeChatId) return; // এই চ্যাটের জন্য onInsert ইতিমধ্যে পিং বাজায়
    playMessagePing();
    refreshChatList();
  });
}

// ---------- Active chat ----------
async function openChat(chatId, peer, chatMeta = null) {
  activeChatId = chatId;
  activePeer = peer;
  activeChatMembers = chatMeta?.members || (peer ? [peer] : []);
  clearReply();
  clearEditing();
  emojiPicker.classList.add('hidden');

  emptyState.classList.add('hidden');
  activeChat.classList.remove('hidden');
  chatPane.classList.add('open');
  sidebar.classList.add('chat-open');

  if (chatMeta?.isGroup) {
    peerAvatar.src = `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(chatMeta.name || chatId)}`;
    peerName.textContent = chatMeta.name || 'গ্রুপ';
    peerStatus.textContent = `${activeChatMembers.length} জন সদস্য`;
    peerStatus.classList.remove('online');
  } else if (peer) {
    peerAvatar.src = peer.avatar_url;
    peerName.textContent = peer.display_name;
    setPeerStatus(peer.is_online, peer.last_seen);
  }

  const msgs = await loadMessages(chatId);
  renderMessages(msgs);
  markVisibleMessagesSeen(msgs);

  unsubMessages?.();
  unsubMessages = subscribeToMessages(chatId, {
    onInsert: (msg) => {
      appendMessage(msg);
      refreshChatList();
      if (msg.sender_id !== currentUser.id) {
        markSeen([msg.id], currentUser.id);
        playMessagePing();
      }
    },
    onUpdate: (msg) => {
      updateMessageInPlace(msg);
      refreshChatList();
    }
  });

  unsubReactions?.();
  unsubReactions = subscribeToReactions(chatId, () => refreshReactionsAndReceipts(chatId));

  unsubReceipts?.();
  unsubReceipts = subscribeToReceipts(chatId, () => refreshReactionsAndReceipts(chatId));

  if (typingChannel) supabase.removeChannel(typingChannel);
  typingChannel = subscribeToTyping(chatId, ({ userId, isTyping }) => {
    if (userId === currentUser.id) return;
    typingIndicator.classList.toggle('hidden', !isTyping);
  });

  if (!chatMeta?.isGroup && peer) {
    unsubPresence?.();
    unsubPresence = subscribeToPresence(peer.id, (profile) => {
      activePeer = { ...activePeer, ...profile };
      setPeerStatus(profile.is_online, profile.last_seen);
    });
  }
}

async function refreshReactionsAndReceipts(chatId) {
  if (chatId !== activeChatId) return;
  const msgs = await loadMessages(chatId);
  for (const m of msgs) {
    messagesById.set(m.id, m);
    const bubbleRow = messagesEl.querySelector(`[data-msg-id="${m.id}"]`);
    if (bubbleRow) renderReactionsAndTicks(bubbleRow, m);
  }
}

function markVisibleMessagesSeen(msgs) {
  const unseenFromOthers = msgs.filter((m) => m.sender_id !== currentUser.id).map((m) => m.id);
  if (unseenFromOthers.length) markSeen(unseenFromOthers, currentUser.id);
}

function setPeerStatus(isOnline, lastSeen) {
  if (isOnline) {
    peerStatus.textContent = 'অনলাইন';
    peerStatus.classList.add('online');
  } else {
    peerStatus.classList.remove('online');
    peerStatus.textContent = lastSeen ? `সর্বশেষ ${formatTime(lastSeen)}` : 'অফলাইন';
  }
}

backBtn.addEventListener('click', () => {
  chatPane.classList.remove('open');
  sidebar.classList.remove('chat-open');
});

// ---------- Rendering messages ----------
function renderMessages(msgs) {
  messagesEl.innerHTML = '';
  messagesById.clear();
  for (const m of msgs) {
    messagesById.set(m.id, m);
    appendMessage(m, false);
  }
  scrollToBottom();
}

function appendMessage(msg, scroll = true) {
  messagesById.set(msg.id, msg);
  const row = document.createElement('div');
  row.className = 'bubble-row ' + (msg.sender_id === currentUser.id ? 'mine' : 'theirs');
  row.dataset.msgId = msg.id;
  row.appendChild(buildBubble(msg));
  messagesEl.appendChild(row);
  if (scroll) scrollToBottom();
}

function updateMessageInPlace(msg) {
  messagesById.set(msg.id, { ...messagesById.get(msg.id), ...msg });
  const row = messagesEl.querySelector(`[data-msg-id="${msg.id}"]`);
  if (!row) return;
  const merged = messagesById.get(msg.id);
  row.innerHTML = '';
  row.appendChild(buildBubble(merged));
}

function buildBubble(msg) {
  const outer = document.createElement('div');
  outer.style.position = 'relative';

  const isJumbo = !msg.deleted_at && msg.kind === 'text' && isEmojiOnlyMessage(msg.body);
  const bubble = document.createElement('div');
  bubble.className =
    'bubble ' +
    (msg.sender_id === currentUser.id ? 'mine' : 'theirs') +
    (msg.deleted_at ? ' deleted' : '') +
    (isJumbo ? ' jumbo-emoji' : '');

  let innerHtml = '';

  if (msg.reply_to && !msg.reply_to.deleted_at) {
    const senderLabel = msg.reply_to.sender_id === currentUser.id ? 'আপনি' : (senderLabelFor(msg.reply_to.sender_id) || 'পিয়ার');
    innerHtml += `<div class="reply-quote"><span class="reply-quote-name">${escapeHtml(senderLabel)}</span>${escapeHtml(truncate(msg.reply_to.body, 80))}</div>`;
  }

  if (msg.deleted_at) {
    innerHtml += `এই মেসেজটি মুছে ফেলা হয়েছে`;
  } else if (msg.kind === 'voice') {
    innerHtml += `<div class="voice-note">🎤<audio controls src="${msg.attachment_url}"></audio></div>`;
  } else if (msg.kind === 'image') {
    innerHtml += `<div class="attachment-bubble"><img class="attachment-image" src="${msg.attachment_url}" alt="ছবি" /></div>`;
  } else if (msg.kind === 'file') {
    innerHtml += `<a class="attachment-file" href="${msg.attachment_url}" target="_blank" rel="noopener">
      <span class="attachment-file-icon">📎</span>
      <span class="attachment-file-name">${escapeHtml(msg.attachment_name || 'ফাইল')}</span>
    </a>`;
  } else {
    innerHtml += escapeHtml(msg.body);
  }

  const editedTag = msg.edited_at && !msg.deleted_at ? `<span class="edited-tag">(এডিট করা)</span>` : '';
  innerHtml += `<span class="bubble-time">${editedTag}<span>${formatTime(msg.created_at)}</span><span class="receipt-tick-slot"></span></span>`;

  bubble.innerHTML = innerHtml;

  if (!msg.deleted_at) {
    bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      openReactionPicker(bubble, msg);
    });
  }

  outer.appendChild(bubble);

  if (!msg.deleted_at) {
    const actions = document.createElement('div');
    actions.className = 'bubble-actions';

    const replyBtn = document.createElement('button');
    replyBtn.className = 'bubble-action-btn';
    replyBtn.textContent = '↩ উত্তর';
    replyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startReply(msg);
    });
    actions.appendChild(replyBtn);

    if (msg.sender_id === currentUser.id && msg.kind === 'text') {
      const editBtn = document.createElement('button');
      editBtn.className = 'bubble-action-btn';
      editBtn.textContent = '✎ এডিট';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startEdit(msg);
      });
      actions.appendChild(editBtn);
    }

    if (msg.sender_id === currentUser.id) {
      const delBtn = document.createElement('button');
      delBtn.className = 'bubble-action-btn';
      delBtn.textContent = '🗑 মুছুন';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await deleteMessage(msg.id);
        } catch (err) {
          toast('মেসেজ মুছা যায়নি');
        }
      });
      actions.appendChild(delBtn);
    }

    outer.appendChild(actions);

    const reactionsRow = document.createElement('div');
    reactionsRow.className = 'reactions-row';
    outer.appendChild(reactionsRow);
  }

  renderReactionsAndTicks(outer, msg);

  return outer;
}

function renderReactionsAndTicks(container, msg) {
  if (!container) return;
  const reactionsRow = container.querySelector('.reactions-row');
  if (reactionsRow) {
    reactionsRow.innerHTML = '';
    const grouped = new Map();
    for (const r of msg.reactions || []) {
      grouped.set(r.emoji, (grouped.get(r.emoji) || 0) + 1);
    }
    for (const [emoji, count] of grouped) {
      const mine = (msg.reactions || []).some((r) => r.emoji === emoji && r.user_id === currentUser.id);
      const chip = document.createElement('span');
      chip.className = 'reaction-chip' + (mine ? ' mine' : '');
      chip.textContent = `${emoji} ${count}`;
      chip.addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleReaction(msg.id, currentUser.id, emoji);
      });
      reactionsRow.appendChild(chip);
    }
  }

  if (msg.sender_id === currentUser.id) {
    const slot = container.querySelector('.receipt-tick-slot');
    if (slot) {
      const others = activeChatMembers.filter((m) => m.id !== currentUser.id).map((m) => m.id);
      const receipts = msg.receipts || [];
      const seenByAll = others.length > 0 && others.every((id) => receipts.some((r) => r.user_id === id && r.seen_at));
      const deliveredToAll = others.length > 0 && others.every((id) => receipts.some((r) => r.user_id === id && r.delivered_at));
      let tick = '✓';
      let cls = 'receipt-tick';
      if (seenByAll) {
        tick = '✓✓';
        cls += ' seen';
      } else if (deliveredToAll) {
        tick = '✓✓';
      }
      slot.innerHTML = `<span class="${cls}">${tick}</span>`;
    }
  }
}

function senderLabelFor(userId) {
  const m = activeChatMembers.find((x) => x.id === userId);
  return m?.display_name;
}

/** মেসেজে শুধুমাত্র ইমোজি (সর্বোচ্চ ৬টা) থাকলে true — WhatsApp-স্টাইল "jumbomoji" বাবলের জন্য ব্যবহৃত */
const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D\s]+$/u;
function isEmojiOnlyMessage(body = '') {
  const trimmed = body.trim();
  if (!trimmed || !EMOJI_ONLY_RE.test(trimmed)) return false;
  const graphemeCount =
    typeof Intl !== 'undefined' && Intl.Segmenter
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)].length
      : [...trimmed].length;
  return graphemeCount > 0 && graphemeCount <= 6;
}

function truncate(str = '', n) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---------- Reaction picker ----------
const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

function openReactionPicker(bubbleEl, msg) {
  closeReactionPicker();
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  for (const emoji of REACTION_EMOJIS) {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleReaction(msg.id, currentUser.id, emoji);
      closeReactionPicker();
    });
    picker.appendChild(btn);
  }
  bubbleEl.style.position = 'relative';
  bubbleEl.appendChild(picker);
  openReactionPickerFor = picker;
}

function closeReactionPicker() {
  openReactionPickerFor?.remove();
  openReactionPickerFor = null;
}

document.addEventListener('click', closeReactionPicker);

// ---------- Reply / Edit ----------
function startReply(msg) {
  clearEditing();
  replyingTo = msg;
  const label = msg.deleted_at ? 'এই মেসেজটি মুছে ফেলা হয়েছে' : truncate(msg.body || (msg.kind === 'voice' ? '🎤 ভয়েস মেসেজ' : '📎 সংযুক্তি'), 90);
  replyPreviewText.textContent = label;
  replyPreview.classList.remove('hidden');
  messageInput.focus();
}

function clearReply() {
  replyingTo = null;
  replyPreview.classList.add('hidden');
}

replyPreviewClose.addEventListener('click', clearReply);

function startEdit(msg) {
  clearReply();
  editingMessageId = msg.id;
  messageInput.value = msg.body;
  editBanner.classList.remove('hidden');
  messageInput.focus();
}

function clearEditing() {
  editingMessageId = null;
  editBanner.classList.add('hidden');
}

editBannerClose.addEventListener('click', () => {
  clearEditing();
  messageInput.value = '';
});

// ---------- Composer: send / edit ----------
composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = messageInput.value.trim();
  if (!body || !activeChatId) return;
  messageInput.value = '';
  emojiPicker.classList.add('hidden');
  sendTyping(typingChannel, currentUser.id, false);

  try {
    if (editingMessageId) {
      await editMessage(editingMessageId, body);
      clearEditing();
    } else {
      await sendMessage(activeChatId, currentUser.id, body, { replyToId: replyingTo?.id || null });
      clearReply();
    }
  } catch (err) {
    toast('মেসেজ পাঠানো যায়নি: ' + err.message);
  }
});

messageInput.addEventListener('input', () => {
  if (!typingChannel) return;
  sendTyping(typingChannel, currentUser.id, true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => sendTyping(typingChannel, currentUser.id, false), 2000);
});

// ---------- Emoji picker (প্রিমিয়াম টেক্সট চ্যাট ফিচার) ----------
const RECENT_EMOJI_KEY = 'waves:recent-emojis';
const RECENT_EMOJI_LIMIT = 24;

function loadRecentEmojis() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_EMOJI_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecentEmoji(emoji) {
  const recents = loadRecentEmojis().filter((e) => e !== emoji);
  recents.unshift(emoji);
  try {
    localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(recents.slice(0, RECENT_EMOJI_LIMIT)));
  } catch {
    // localStorage না থাকলে (প্রাইভেট মোড ইত্যাদি) নীরবে উপেক্ষা — শুধু "সাম্প্রতিক" ফিচারটা কাজ করবে না
  }
}

let activeEmojiTab = 'recent';

function renderEmojiTabs() {
  emojiTabs.innerHTML = '';
  const tabs = [{ id: 'recent', icon: '🕑', label: 'সাম্প্রতিক' }, ...EMOJI_CATEGORIES.map((c) => ({ id: c.id, icon: c.icon, label: c.label }))];
  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-tab' + (tab.id === activeEmojiTab ? ' active' : '');
    btn.textContent = tab.icon;
    btn.title = tab.label;
    btn.addEventListener('click', () => {
      activeEmojiTab = tab.id;
      emojiSearch.value = '';
      renderEmojiTabs();
      renderEmojiGrid();
    });
    emojiTabs.appendChild(btn);
  }
}

function renderEmojiGrid() {
  const query = emojiSearch.value.trim();
  emojiGrid.innerHTML = '';

  let list;
  if (query) {
    // সাধারণ ইমোজি সার্চ — আমাদের কিউরেটেড ক্যাটেগরি লেবেলের সাথে মিলিয়ে দেখানো হয়
    const q = query.toLowerCase();
    const matchedCategories = EMOJI_CATEGORIES.filter((c) => c.label.toLowerCase().includes(q));
    list = matchedCategories.length ? matchedCategories.flatMap((c) => c.emojis) : [];
    if (!list.length) {
      emojiGrid.innerHTML = `<div class="emoji-grid-empty">কিছু পাওয়া যায়নি — ক্যাটেগরির নাম দিয়ে খুঁজুন (যেমন "মুখাবয়ব")</div>`;
      return;
    }
  } else if (activeEmojiTab === 'recent') {
    list = loadRecentEmojis();
    if (!list.length) {
      emojiGrid.innerHTML = `<div class="emoji-grid-empty">এখনো কোনো ইমোজি ব্যবহার করেননি</div>`;
      return;
    }
  } else {
    list = EMOJI_CATEGORIES.find((c) => c.id === activeEmojiTab)?.emojis || [];
  }

  for (const emoji of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-grid-cell';
    btn.textContent = emoji;
    btn.addEventListener('click', () => insertEmoji(emoji));
    emojiGrid.appendChild(btn);
  }
}

function insertEmoji(emoji) {
  const el = messageInput;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + emoji + el.value.slice(end);
  const caret = start + emoji.length;
  el.focus();
  el.setSelectionRange(caret, caret);
  saveRecentEmoji(emoji);
  if (typingChannel) sendTyping(typingChannel, currentUser.id, true);
}

emojiBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = emojiPicker.classList.contains('hidden');
  emojiPicker.classList.toggle('hidden');
  if (willOpen) {
    renderEmojiTabs();
    renderEmojiGrid();
    emojiSearch.value = '';
  }
});

emojiSearch.addEventListener('input', renderEmojiGrid);

emojiPicker.addEventListener('click', (e) => e.stopPropagation());

document.addEventListener('click', () => emojiPicker.classList.add('hidden'));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') emojiPicker.classList.add('hidden');
});

// ---------- File / image attachment ----------
attachBtn.addEventListener('click', () => {
  emojiPicker.classList.add('hidden');
  fileInput.click();
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file || !activeChatId) return;
  const kind = file.type.startsWith('image/') ? 'image' : 'file';
  try {
    await sendAttachmentMessage(activeChatId, currentUser.id, file, { kind, replyToId: replyingTo?.id || null });
    clearReply();
  } catch (err) {
    toast('ফাইল পাঠানো যায়নি: ' + err.message);
  }
});

// ---------- Voice notes ----------
micRecordBtn.addEventListener('click', async () => {
  emojiPicker.classList.add('hidden');
  try {
    voiceRecorder = new VoiceRecorder();
    await voiceRecorder.start();
    micRecordBtn.classList.add('recording');
    recordingBar.classList.remove('hidden');
    composer.classList.add('hidden');
    let seconds = 0;
    recordingTime.textContent = '0:00';
    recordingInterval = setInterval(() => {
      seconds += 1;
      const m = Math.floor(seconds / 60);
      const s = String(seconds % 60).padStart(2, '0');
      recordingTime.textContent = `${m}:${s}`;
    }, 1000);
  } catch (err) {
    toast('মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি');
  }
});

recordingCancelBtn.addEventListener('click', () => {
  voiceRecorder?.cancel();
  stopRecordingUi();
});

recordingSendBtn.addEventListener('click', async () => {
  if (!voiceRecorder) return;
  const result = await voiceRecorder.stop();
  stopRecordingUi();
  if (!result || !activeChatId) return;
  try {
    await sendAttachmentMessage(activeChatId, currentUser.id, result.file, {
      kind: 'voice',
      replyToId: replyingTo?.id || null,
      durationSeconds: result.durationSeconds
    });
    clearReply();
  } catch (err) {
    toast('ভয়েস মেসেজ পাঠানো যায়নি: ' + err.message);
  }
});

function stopRecordingUi() {
  clearInterval(recordingInterval);
  micRecordBtn.classList.remove('recording');
  recordingBar.classList.add('hidden');
  composer.classList.remove('hidden');
  voiceRecorder = null;
}

// ---------- Calling ----------
function initCallManager() {
  callManager = new CallManager({
    myId: currentUser.id,
    onIncomingCall: handleIncomingCall,
    onStateChange: handleCallStateChange,
    onRemoteStream: handleRemoteStream,
    onPeerLeft: handlePeerLeft
  });
}

let incomingFrom = null;
let incomingIsVideo = false;
let incomingIsGroup = false;

function handleIncomingCall({ from, video, group }) {
  incomingFrom = from;
  incomingIsVideo = video;
  incomingIsGroup = group;
  const peerLabel =
    (activePeer && activePeer.id === from && activePeer) ||
    activeChatMembers.find((m) => m.id === from) || { display_name: 'একজন ব্যবহারকারী', avatar_url: '' };
  incomingName.textContent = peerLabel.display_name;
  incomingType.textContent = (group ? 'গ্রুপ ' : '') + (video ? 'ভিডিও কল আসছে' : 'ভয়েস কল আসছে');
  incomingAvatar.src = peerLabel.avatar_url;
  incomingCallEl.classList.remove('hidden');
  startRingtone();
}

acceptCallBtn.addEventListener('click', async () => {
  incomingCallEl.classList.add('hidden');
  stopRingtone();
  openCallOverlay(incomingIsVideo, activePeer || { display_name: incomingName.textContent, avatar_url: incomingAvatar.src });
  try {
    const localStream = await callManager.acceptCall();
    localVideo.srcObject = localStream;
    applySpeakerPreference();
  } catch (err) {
    toast('কল গ্রহণ করা যায়নি: ' + err.message);
    closeCallOverlay();
  }
});

declineCallBtn.addEventListener('click', () => {
  incomingCallEl.classList.add('hidden');
  stopRingtone();
  callManager.declineCall();
});

voiceCallBtn.addEventListener('click', () => startOutgoingCall(false));
videoCallBtn.addEventListener('click', () => startOutgoingCall(true));

async function startOutgoingCall(video) {
  if (!activeChatId) return;
  const targetIds = activeChatMembers.filter((m) => m.id !== currentUser.id).map((m) => m.id);
  if (!targetIds.length) return;
  openCallOverlay(video, activePeer || { display_name: peerName.textContent, avatar_url: peerAvatar.src });
  startOutgoingRingback();
  try {
    const localStream = await callManager.startCall(targetIds, video, { chatId: activeChatId });
    localVideo.srcObject = localStream;
    applySpeakerPreference();
  } catch (err) {
    stopRingtone();
    toast('কল শুরু করা যায়নি: ' + err.message);
    closeCallOverlay();
  }
}

function openCallOverlay(video, peer) {
  callOverlay.classList.remove('hidden');
  callPeerName.textContent = peer.display_name;
  callAvatar.src = peer.avatar_url;
  callStatus.textContent = 'রিং হচ্ছে...';
  remoteTilesEl.innerHTML = '';
  remoteTilesEl.classList.add('hidden');
  if (video) {
    videoGrid.classList.remove('hidden');
    toggleCamBtn.classList.remove('hidden');
    switchCamBtn.classList.remove('hidden');
  } else {
    videoGrid.classList.add('hidden');
    toggleCamBtn.classList.add('hidden');
    switchCamBtn.classList.add('hidden');
  }
  micOn = true;
  camOn = true;
  toggleMicBtn.classList.remove('off');
  toggleCamBtn.classList.remove('off');
}

function closeCallOverlay() {
  stopRingtone();
  callOverlay.classList.add('hidden');
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  remoteAudioEl.srcObject = null;
  remoteTilesEl.innerHTML = '';
}

function handleCallStateChange(state) {
  if (state === 'ringing') callStatus.textContent = 'রিং হচ্ছে...';
  if (state === 'connecting') callStatus.textContent = 'সংযুক্ত হচ্ছে...';
  if (state === 'connected') {
    callStatus.textContent = 'সংযুক্ত';
    stopRingtone();
  }
  if (state === 'ended') {
    toast('কল শেষ হয়েছে');
    closeCallOverlay();
  }
}

/** একাধিক পিয়ারের রিমোট স্ট্রিম হ্যান্ডল করুন — 1:1 হলে মূল remote-video/audio এলিমেন্টে, গ্রুপ কলে টাইলে */
function handleRemoteStream(peerId, stream) {
  const hasVideo = stream.getVideoTracks().length > 0;

  if (!callManager.isGroup) {
    if (hasVideo) {
      remoteVideo.srcObject = stream;
    } else {
      remoteAudioEl.srcObject = stream;
    }
    return;
  }

  remoteTilesEl.classList.remove('hidden');
  videoGrid.classList.add('hidden');
  let tile = remoteTilesEl.querySelector(`[data-peer-id="${peerId}"]`);
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'remote-tile';
    tile.dataset.peerId = peerId;
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    const nameTag = document.createElement('span');
    nameTag.className = 'remote-tile-name';
    nameTag.textContent = senderLabelFor(peerId) || 'অংশগ্রহণকারী';
    tile.appendChild(video);
    tile.appendChild(nameTag);
    remoteTilesEl.appendChild(tile);
  }
  tile.querySelector('video').srcObject = stream;
}

function handlePeerLeft(peerId) {
  const tile = remoteTilesEl.querySelector(`[data-peer-id="${peerId}"]`);
  tile?.remove();
}

toggleMicBtn.addEventListener('click', () => {
  micOn = !micOn;
  callManager.toggleMic(micOn);
  toggleMicBtn.classList.toggle('off', !micOn);
});

toggleCamBtn.addEventListener('click', () => {
  camOn = !camOn;
  callManager.toggleCam(camOn);
  toggleCamBtn.classList.toggle('off', !camOn);
});

/** স্পিকার/ইয়ারপিস টগল — আগে এই কন্ট্রোলটাই ছিল না বলে কল সবসময় ডিভাইসের ডিফল্ট
    আউটপুটে (প্রায়ই লাউডস্পিকার) চলে যেত। */
let speakerOn = true;
speakerBtn.addEventListener('click', async () => {
  speakerOn = !speakerOn;
  await applySpeakerPreference();
});

async function applySpeakerPreference() {
  const targetEl = videoGrid.classList.contains('hidden') ? remoteAudioEl : remoteVideo;
  const result = await callManager.setSpeaker(targetEl, speakerOn);
  speakerBtn.textContent = speakerOn ? '🔊' : '🔈';
  speakerBtn.title = speakerOn ? 'লাউডস্পিকার চালু' : 'ইয়ারপিস/ডিফল্ট আউটপুট';
  if (!result.supported) {
    toast(speakerOn ? 'লাউডস্পিকার (ডিভাইস সমর্থন সীমিত হতে পারে)' : 'ইয়ারপিস মোড (ডিভাইস সমর্থন সীমিত হতে পারে)');
  }
}

/** ব্যাক/ফ্রন্ট ক্যামেরা সুইচ — আগে এই বাটনই ছিল না এবং ভিডিও facingMode হার্ডকোড ছিল, তাই ব্যাক ক্যামেরায় সুইচ করলে ব্ল্যাক স্ক্রিন হতো। এখন পুরনো ট্র্যাক আগে বন্ধ করে তারপর নতুন ক্যামেরা রিকোয়েস্ট করা হয়, যা বেশিরভাগ অ্যান্ড্রয়েড ডিভাইসের হার্ডওয়্যার লক সমস্যা এড়ায়। */
let switchingCamera = false;
switchCamBtn.addEventListener('click', async () => {
  if (switchingCamera) return;
  switchingCamera = true;
  switchCamBtn.disabled = true;
  try {
    const newStream = await callManager.switchCamera();
    if (newStream) localVideo.srcObject = newStream;
  } catch (err) {
    console.warn('switchCamera failed', err);
    toast('ক্যামেরা পাল্টানো যায়নি — এই ডিভাইসে দ্বিতীয় ক্যামেরা নাও থাকতে পারে, অথবা ব্রাউজারকে ক্যামেরা পারমিশন দিন');
  } finally {
    switchingCamera = false;
    switchCamBtn.disabled = false;
  }
});

endCallBtn.addEventListener('click', () => {
  callManager.hangUp(true);
  closeCallOverlay();
});

// ---------- Call history ----------
callHistoryBtn.addEventListener('click', async () => {
  callHistoryPanel.classList.remove('hidden');
  await renderCallHistory();
});

closeCallHistoryBtn.addEventListener('click', () => callHistoryPanel.classList.add('hidden'));

async function renderCallHistory() {
  const logs = await loadCallHistory(currentUser.id);
  callHistoryList.innerHTML = '';
  if (!logs.length) {
    callHistoryList.innerHTML = `<li style="padding:24px; color: var(--text-mute); text-align:center;">কোনো কল হিস্ট্রি নেই</li>`;
    return;
  }
  for (const log of logs) {
    const others = (log.call_participants || [])
      .map((p) => p.profiles)
      .filter((p) => p && p.id !== currentUser.id);
    const label = log.is_group
      ? `গ্রুপ কল (${others.length + 1} জন)`
      : others[0]?.display_name || 'অজানা';
    const avatarSrc = others[0]?.avatar_url || `https://api.dicebear.com/9.x/shapes/svg?seed=${log.id}`;

    const directionIcon = log.iCalled ? '↗' : '↙';
    const statusLabel =
      log.status === 'missed' ? 'মিসড কল' : log.status === 'declined' ? 'প্রত্যাখ্যাত' : log.status === 'answered' ? 'উত্তর দেওয়া হয়েছে' : 'শেষ হয়েছে';
    const durationLabel = log.duration_seconds ? ` · ${formatDuration(log.duration_seconds)}` : '';

    const li = document.createElement('li');
    li.className = 'call-history-item';
    li.innerHTML = `
      <div class="avatar-ring sm"><img class="avatar" src="${avatarSrc}" alt="" /></div>
      <div class="call-history-body">
        <div class="call-history-top"><strong>${escapeHtml(label)}</strong> <span>${log.is_video ? '🎥' : '📞'}</span></div>
        <div class="call-history-meta ${log.status === 'missed' ? 'missed' : ''}">${directionIcon} ${statusLabel}${durationLabel}</div>
      </div>
      <span class="call-history-time">${formatTime(log.started_at)}</span>
      <button class="call-again-btn" aria-label="আবার কল করুন">${log.is_video ? '🎥' : '📞'}</button>
    `;
    const callAgainBtn = li.querySelector('.call-again-btn');
    callAgainBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      callHistoryPanel.classList.add('hidden');
      if (log.is_group) {
        toast('গ্রুপ কল আবার শুরু করতে চ্যাট থেকে কল বাটন ব্যবহার করুন');
        return;
      }
      const target = others[0];
      if (!target) return;
      try {
        const chatId = await getOrCreateDirectChat(currentUser.id, target.id);
        await openChat(chatId, target);
        await startOutgoingCall(log.is_video);
      } catch (err) {
        toast('কল করা যায়নি');
      }
    });
    callHistoryList.appendChild(li);
  }
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------- Helpers ----------
function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('bn-BD', { day: '2-digit', month: 'short' });
}

// Heartbeat: প্রতি ৩০ সেকেন্ডে অনলাইন স্ট্যাটাস রিফ্রেশ করুন
setInterval(() => {
  if (currentUser) setOnlineStatus(currentUser.id, true);
}, 30000);

document.addEventListener('visibilitychange', () => {
  if (currentUser) setOnlineStatus(currentUser.id, document.visibilityState === 'visible');
});
