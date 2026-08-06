import { supabase } from './lib/supabase.js';
import { sendOtp, verifyOtp, getSession, onAuthChange, signOut, ensureProfile, setOnlineStatus } from './lib/auth.js';
import {
  searchProfiles,
  loadMyChats,
  getOrCreateDirectChat,
  loadMessages,
  sendMessage,
  subscribeToMessages,
  subscribeToPresence
} from './lib/chat.js';
import { CallManager } from './lib/calls.js';
import { registerServiceWorker } from './lib/pwa.js';

registerServiceWorker();

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);
const authScreen = $('auth-screen');
const mainScreen = $('main-screen');
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
const composer = $('composer');
const messageInput = $('message-input');
const voiceCallBtn = $('voice-call-btn');
const videoCallBtn = $('video-call-btn');

const callOverlay = $('call-overlay');
const callAvatar = $('call-avatar');
const callPeerName = $('call-peer-name');
const callStatus = $('call-status');
const videoGrid = $('video-grid');
const remoteVideo = $('remote-video');
const localVideo = $('local-video');
const toggleMicBtn = $('toggle-mic-btn');
const toggleCamBtn = $('toggle-cam-btn');
const endCallBtn = $('end-call-btn');

const incomingCallEl = $('incoming-call');
const incomingAvatar = $('incoming-avatar');
const incomingName = $('incoming-name');
const incomingType = $('incoming-type');
const acceptCallBtn = $('accept-call-btn');
const declineCallBtn = $('decline-call-btn');

const toastRoot = $('toast-root');

// ---------- state ----------
let currentUser = null;
let currentProfile = null;
let callManager = null;
let activeChatId = null;
let activePeer = null;
let unsubMessages = null;
let unsubPresence = null;
let micOn = true;
let camOn = true;
let pendingEmailForOtp = '';

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---------- Auth flow ----------
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
  if (currentUser) await setOnlineStatus(currentUser.id, false);
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
  } else {
    currentUser = null;
    currentProfile = null;
    showAuth();
  }
});

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

window.addEventListener('beforeunload', () => {
  if (currentUser) navigator.sendBeacon?.('/'); // best-effort; real presence handled via heartbeat below
});

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
      const chatId = await getOrCreateDirectChat(currentUser.id, profile.id);
      searchInput.value = '';
      await refreshChatList();
      openChat(chatId, profile);
    });
    chatListEl.appendChild(li);
  }
}

// ---------- Chat list ----------
async function refreshChatList() {
  const chats = await loadMyChats(currentUser.id);
  chatListEl.innerHTML = '';
  if (!chats.length) {
    chatListEl.innerHTML = `<li class="empty-state" style="padding:24px;">উপরে সার্চ করে কারও সাথে চ্যাট শুরু করুন</li>`;
    return;
  }
  for (const chat of chats) {
    if (!chat.peer) continue;
    const li = document.createElement('li');
    li.className = 'chat-item' + (chat.id === activeChatId ? ' active' : '');
    const preview = chat.lastMsg ? escapeHtml(chat.lastMsg.body) : 'কথোপকথন শুরু করুন';
    const time = chat.lastMsg ? formatTime(chat.lastMsg.created_at) : '';
    li.innerHTML = `
      <div class="avatar-ring sm"><img class="avatar" src="${chat.peer.avatar_url}" alt="" /></div>
      <div class="chat-item-body">
        <div class="chat-item-top">
          <strong>${escapeHtml(chat.peer.display_name)}</strong>
          <span class="chat-item-time">${time}</span>
        </div>
        <div class="chat-item-preview">${preview}</div>
      </div>`;
    li.addEventListener('click', () => openChat(chat.id, chat.peer));
    chatListEl.appendChild(li);
  }
}

// ---------- Active chat ----------
async function openChat(chatId, peer) {
  activeChatId = chatId;
  activePeer = peer;

  emptyState.classList.add('hidden');
  activeChat.classList.remove('hidden');
  chatPane.classList.add('open');
  sidebar.classList.add('chat-open');

  peerAvatar.src = peer.avatar_url;
  peerName.textContent = peer.display_name;
  setPeerStatus(peer.is_online, peer.last_seen);

  const msgs = await loadMessages(chatId);
  renderMessages(msgs);

  unsubMessages?.();
  unsubMessages = subscribeToMessages(chatId, (msg) => {
    appendMessage(msg);
    refreshChatList();
  });

  unsubPresence?.();
  unsubPresence = subscribeToPresence(peer.id, (profile) => {
    activePeer = { ...activePeer, ...profile };
    setPeerStatus(profile.is_online, profile.last_seen);
  });
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

function renderMessages(msgs) {
  messagesEl.innerHTML = '';
  for (const m of msgs) appendMessage(m, false);
  scrollToBottom();
}

function appendMessage(msg, scroll = true) {
  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + (msg.sender_id === currentUser.id ? 'mine' : 'theirs');
  bubble.innerHTML = `${escapeHtml(msg.body)}<span class="bubble-time">${formatTime(msg.created_at)}</span>`;
  messagesEl.appendChild(bubble);
  if (scroll) scrollToBottom();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = messageInput.value.trim();
  if (!body || !activeChatId) return;
  messageInput.value = '';
  try {
    await sendMessage(activeChatId, currentUser.id, body);
  } catch (err) {
    toast('মেসেজ পাঠানো যায়নি: ' + err.message);
  }
});

// ---------- Calling ----------
function initCallManager() {
  callManager = new CallManager({
    myId: currentUser.id,
    onIncomingCall: handleIncomingCall,
    onStateChange: handleCallStateChange,
    onRemoteStream: (stream) => {
      remoteVideo.srcObject = stream;
    }
  });
}

let incomingFrom = null;
let incomingIsVideo = false;

function handleIncomingCall({ from, video }) {
  incomingFrom = from;
  incomingIsVideo = video;
  const peerLabel = activePeer && activePeer.id === from ? activePeer : { display_name: 'একজন ব্যবহারকারী', avatar_url: '' };
  incomingName.textContent = peerLabel.display_name;
  incomingType.textContent = video ? 'ভিডিও কল আসছে' : 'ভয়েস কল আসছে';
  incomingAvatar.src = peerLabel.avatar_url;
  incomingCallEl.classList.remove('hidden');
}

acceptCallBtn.addEventListener('click', async () => {
  incomingCallEl.classList.add('hidden');
  openCallOverlay(incomingIsVideo, activePeer);
  const localStream = await callManager.acceptCall();
  localVideo.srcObject = localStream;
});

declineCallBtn.addEventListener('click', () => {
  incomingCallEl.classList.add('hidden');
  callManager.declineCall();
});

voiceCallBtn.addEventListener('click', () => startOutgoingCall(false));
videoCallBtn.addEventListener('click', () => startOutgoingCall(true));

async function startOutgoingCall(video) {
  if (!activePeer) return;
  openCallOverlay(video, activePeer);
  try {
    const localStream = await callManager.startCall(activePeer.id, video);
    localVideo.srcObject = localStream;
  } catch (err) {
    toast('কল শুরু করা যায়নি: ' + err.message);
    closeCallOverlay();
  }
}

function openCallOverlay(video, peer) {
  callOverlay.classList.remove('hidden');
  callPeerName.textContent = peer.display_name;
  callAvatar.src = peer.avatar_url;
  callStatus.textContent = 'রিং হচ্ছে...';
  if (video) {
    videoGrid.classList.remove('hidden');
    toggleCamBtn.classList.remove('hidden');
  } else {
    videoGrid.classList.add('hidden');
    toggleCamBtn.classList.add('hidden');
  }
  micOn = true;
  camOn = true;
}

function closeCallOverlay() {
  callOverlay.classList.add('hidden');
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
}

function handleCallStateChange(state) {
  if (state === 'ringing') callStatus.textContent = 'রিং হচ্ছে...';
  if (state === 'connecting') callStatus.textContent = 'সংযুক্ত হচ্ছে...';
  if (state === 'connected') callStatus.textContent = 'সংযুক্ত';
  if (state === 'ended') {
    toast('কল শেষ হয়েছে');
    closeCallOverlay();
  }
}

toggleMicBtn.addEventListener('click', () => {
  micOn = !micOn;
  callManager.toggleMic(micOn);
  toggleMicBtn.style.opacity = micOn ? '1' : '0.5';
});

toggleCamBtn.addEventListener('click', () => {
  camOn = !camOn;
  callManager.toggleCam(camOn);
  toggleCamBtn.style.opacity = camOn ? '1' : '0.5';
});

endCallBtn.addEventListener('click', () => {
  callManager.hangUp(true);
  closeCallOverlay();
});

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
