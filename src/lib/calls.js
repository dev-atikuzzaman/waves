import { supabase } from './supabase.js';
import { createCallLog, markCallAnswered, endCallLog, addCallParticipant, markParticipantJoined, markParticipantLeft } from './callLogs.js';

const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

const turnUrl = import.meta.env.VITE_TURN_URL;
if (turnUrl) {
  iceServers.push({
    urls: turnUrl,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL
  });
}

function userChannelName(userId) {
  return `signal:${userId}`;
}

/**
 * একটা একক পিয়ারের সাথে RTCPeerConnection + তার ট্র্যাক/আইস স্টেট মোড়ানো।
 * গ্রুপ কলে প্রতিটি অন্য অংশগ্রহণকারীর জন্য একটা করে PeerLink থাকে (mesh টপোলজি)।
 */
class PeerLink {
  constructor(peerId, { onTrack, onIceCandidate, onStateChange }) {
    this.peerId = peerId;
    this.onTrack = onTrack;
    this.onIceCandidate = onIceCandidate;
    this.onStateChange = onStateChange;
    this.pc = new RTCPeerConnection({ iceServers });
    this.senders = [];
    this._pendingCandidates = [];
    this._remoteDescSet = false;

    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.onIceCandidate?.(this.peerId, e.candidate);
    };
    this.pc.ontrack = (e) => this.onTrack?.(this.peerId, e.streams[0]);
    this.pc.onconnectionstatechange = () => this.onStateChange?.(this.peerId, this.pc.connectionState);
    this.pc.oniceconnectionstatechange = () => this.onStateChange?.(this.peerId, this.pc.iceConnectionState);
  }

  addLocalStream(stream) {
    stream.getTracks().forEach((t) => this.senders.push(this.pc.addTrack(t, stream)));
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(offer) {
    await this.pc.setRemoteDescription(offer);
    this._remoteDescSet = true;
    await this._flushPendingCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async setRemoteAnswer(answer) {
    await this.pc.setRemoteDescription(answer);
    this._remoteDescSet = true;
    await this._flushPendingCandidates();
  }

  async addIceCandidate(candidate) {
    if (!this._remoteDescSet) {
      // অফার/আনসার এখনো সম্পন্ন হয়নি — ক্যান্ডিডেট সাময়িকভাবে জমা রাখুন,
      // নাহলে "মাঝে মাঝে কথা শোনা যাচ্ছে না" জাতীয় race condition হয়।
      this._pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (e) {
      console.warn('ICE candidate error', e);
    }
  }

  async _flushPendingCandidates() {
    const queued = this._pendingCandidates.splice(0);
    for (const c of queued) {
      try {
        await this.pc.addIceCandidate(c);
      } catch (e) {
        console.warn('ICE candidate error (flushed)', e);
      }
    }
  }

  toggleMic(enabled) {
    this.senders.forEach((s) => {
      if (s.track && s.track.kind === 'audio') s.track.enabled = enabled;
    });
  }

  toggleCam(enabled) {
    this.senders.forEach((s) => {
      if (s.track && s.track.kind === 'video') s.track.enabled = enabled;
    });
  }

  /** ব্যাক/ফ্রন্ট ক্যামেরা সুইচ করার সময় নতুন ভিডিও ট্র্যাক দিয়ে বিদ্যমান sender রিপ্লেস করুন (renegotiation ছাড়াই) */
  async replaceVideoTrack(newTrack) {
    const sender = this.senders.find((s) => s.track && s.track.kind === 'video');
    if (sender) {
      await sender.replaceTrack(newTrack);
    }
  }

  close() {
    this.pc.close();
  }
}

export class CallManager {
  constructor({ myId, onIncomingCall, onStateChange, onRemoteStream, onPeerLeft }) {
    this.myId = myId;
    this.onIncomingCall = onIncomingCall;
    this.onStateChange = onStateChange; // 'ringing' | 'connecting' | 'connected' | 'ended'
    this.onRemoteStream = onRemoteStream; // (peerId, stream) => void
    this.onPeerLeft = onPeerLeft; // (peerId) => void
    this.links = new Map(); // peerId -> PeerLink
    this.localStream = null;
    this.isVideo = false;
    this.isGroup = false;
    this.chatId = null;
    this.callLogId = null;
    this.myChannel = null;
    this.currentCameraFacing = 'user';
    this.speakerOn = true;
    this._connectedPeers = new Set();
    this._callStartedAt = null;

    this._listenForIncomingCalls();
  }

  _listenForIncomingCalls() {
    this.myChannel = supabase
      .channel(userChannelName(this.myId))
      .on('broadcast', { event: 'signal' }, ({ payload }) => this._handleSignal(payload))
      .subscribe();
  }

  async _sendSignal(toUserId, payload) {
    const channel = supabase.channel(userChannelName(toUserId));
    await channel.subscribe();
    await channel.send({ type: 'broadcast', event: 'signal', payload: { ...payload, from: this.myId } });
    supabase.removeChannel(channel);
  }

  async _handleSignal(payload) {
    if (payload.from === this.myId) return;

    switch (payload.kind) {
      case 'call-offer': {
        this.isVideo = payload.video;
        this.isGroup = !!payload.group;
        this.chatId = payload.chatId || null;
        this.callLogId = payload.callLogId || null;
        this.pendingOffers = this.pendingOffers || new Map();
        this.pendingOffers.set(payload.from, payload.sdp);
        this.onIncomingCall?.({ from: payload.from, video: payload.video, group: this.isGroup, chatId: this.chatId });
        break;
      }
      case 'call-answer': {
        const link = this.links.get(payload.from);
        if (link) await link.setRemoteAnswer(payload.sdp);
        break;
      }
      case 'ice-candidate': {
        const link = this.links.get(payload.from);
        if (link && payload.candidate) await link.addIceCandidate(payload.candidate);
        break;
      }
      case 'call-end': {
        this._removePeer(payload.from);
        break;
      }
      case 'call-decline': {
        this._removePeer(payload.from);
        if (this.links.size === 0) {
          this.onStateChange?.('ended');
          this._cleanup();
        }
        break;
      }
      case 'peer-join': {
        if (this.isGroup && this.localStream && !this.links.has(payload.from)) {
          await this._connectToPeer(payload.from, true);
        }
        break;
      }
    }
  }

  _removePeer(peerId) {
    const link = this.links.get(peerId);
    if (link) {
      link.close();
      this.links.delete(peerId);
    }
    this._connectedPeers.delete(peerId);
    if (this.callLogId) markParticipantLeft(this.callLogId, peerId);
    this.onPeerLeft?.(peerId);
    if (!this.isGroup && this.links.size === 0) {
      this.onStateChange?.('ended');
      this._cleanup();
    }
  }

  async _getMedia(video) {
    // অডিও কনস্ট্রেইন্টে echoCancellation/noiseSuppression/autoGainControl স্পষ্টভাবে
    // চালু রাখা — "মাঝে মাঝে কথা শোনা যাচ্ছে না" সমস্যার একটা সাধারণ কারণ হলো কিছু
    // ডিভাইসে ডিফল্ট মিডিয়া কনস্ট্রেইন্ট নিজে থেকেই এগুলো বন্ধ রাখে।
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: video ? { facingMode: this.currentCameraFacing } : false
    });
  }

  async _connectToPeer(peerId, isInitiator) {
    const link = new PeerLink(peerId, {
      onTrack: (pid, stream) => this.onRemoteStream?.(pid, stream),
      onIceCandidate: (pid, candidate) => this._sendSignal(pid, { kind: 'ice-candidate', candidate }),
      onStateChange: (pid, state) => {
        if (state === 'connected' && !this._connectedPeers.has(pid)) {
          this._connectedPeers.add(pid);
          this.onStateChange?.('connected');
          if (this.callLogId) {
            markCallAnswered(this.callLogId);
            markParticipantJoined(this.callLogId, pid);
          }
        }
        if (['failed', 'disconnected', 'closed'].includes(state)) {
          this._removePeer(pid);
        }
      }
    });
    this.links.set(peerId, link);
    if (this.localStream) link.addLocalStream(this.localStream);

    if (isInitiator) {
      const offer = await link.createOffer();
      await this._sendSignal(peerId, {
        kind: 'call-offer',
        sdp: offer,
        video: this.isVideo,
        group: this.isGroup,
        chatId: this.chatId,
        callLogId: this.callLogId
      });
    }
    return link;
  }

  /** একক (1:1) অথবা গ্রুপ কল শুরু করুন। peerIds অ্যারে দিলে গ্রুপ কল হবে। */
  async startCall(peerIds, video = false, { chatId = null } = {}) {
    const ids = Array.isArray(peerIds) ? peerIds : [peerIds];
    this.isVideo = video;
    this.isGroup = ids.length > 1;
    this.chatId = chatId;
    this.currentCameraFacing = 'user';
    this.speakerOn = video;

    this.localStream = await this._getMedia(video);
    this._callStartedAt = Date.now();

    this.callLogId = await createCallLog({ chatId, callerId: this.myId, isVideo: video, isGroup: this.isGroup });
    for (const id of ids) await addCallParticipant(this.callLogId, id);
    for (const id of ids) await this._connectToPeer(id, true);

    this.onStateChange?.('ringing');
    return this.localStream;
  }

  async acceptCall() {
    const fromIds = this.pendingOffers ? [...this.pendingOffers.keys()] : [];
    this.localStream = await this._getMedia(this.isVideo);
    this._callStartedAt = Date.now();
    this.currentCameraFacing = 'user';
    this.speakerOn = this.isVideo;

    for (const peerId of fromIds) {
      const offer = this.pendingOffers.get(peerId);
      const link = await this._connectToPeer(peerId, false);
      const answer = await link.createAnswer(offer);
      await this._sendSignal(peerId, { kind: 'call-answer', sdp: answer });
      await this._sendSignal(peerId, { kind: 'peer-join' });
    }
    this.pendingOffers?.clear();
    this.onStateChange?.('connecting');
    if (this.callLogId) markCallAnswered(this.callLogId);
    return this.localStream;
  }

  /** গ্রুপ কল চলাকালীন নতুন একজনকে যোগ করুন */
  async addParticipant(peerId) {
    if (!this.localStream) return;
    this.isGroup = true;
    if (this.callLogId) await addCallParticipant(this.callLogId, peerId);
    await this._connectToPeer(peerId, true);
  }

  declineCall() {
    const fromIds = this.pendingOffers ? [...this.pendingOffers.keys()] : [];
    fromIds.forEach((id) => this._sendSignal(id, { kind: 'call-decline' }));
    if (this.callLogId) endCallLog(this.callLogId, 'declined', 0);
    this._cleanup();
  }

  hangUp(notifyPeers = true) {
    if (notifyPeers) {
      for (const peerId of this.links.keys()) this._sendSignal(peerId, { kind: 'call-end' });
    }
    const durationSeconds = this._callStartedAt ? Math.round((Date.now() - this._callStartedAt) / 1000) : 0;
    if (this.callLogId) {
      const status = this._connectedPeers.size > 0 ? 'ended' : 'missed';
      endCallLog(this.callLogId, status, durationSeconds);
    }
    this.onStateChange?.('ended');
    this._cleanup();
  }

  toggleMic(enabled) {
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  }

  toggleCam(enabled) {
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = enabled));
  }

  /**
   * স্পিকার/ইয়ারপিস টগল করুন। মোবাইল ব্রাউজারে সরাসরি ইয়ারপিসে রুট করার কোনো
   * স্ট্যান্ডার্ড ওয়েব API নেই, কিন্তু setSinkId (সাপোর্টেড ব্রাউজারে) দিয়ে আউটপুট
   * ডিভাইস বেছে নেওয়া যায়। আগে এই কন্ট্রোলটাই ছিল না, তাই কল "সরাসরি লাউডস্পিকার
   * হয়ে যাচ্ছিল" — ব্রাউজার/ডিভাইস নিজের ডিফল্টে চলে যেত।
   */
  async setSpeaker(mediaEl, wantSpeaker) {
    this.speakerOn = wantSpeaker;
    if (!mediaEl || typeof mediaEl.setSinkId !== 'function') {
      return { supported: false };
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === 'audiooutput');
      const target = wantSpeaker
        ? outputs.find((d) => /speaker/i.test(d.label))
        : outputs.find((d) => /earpiece|receiver|ear/i.test(d.label));
      await mediaEl.setSinkId(target ? target.deviceId : '');
      return { supported: true };
    } catch (e) {
      console.warn('setSinkId failed', e);
      return { supported: false, error: e };
    }
  }

  /** ফ্রন্ট/ব্যাক ক্যামেরা সুইচ করুন। আগে facingMode 'user'-এ হার্ডকোড ছিল বলে ব্যাক ক্যামেরায় সুইচ করার কোনো উপায়ই ছিল না — সেই না-থাকা ফিচারটাই ব্ল্যাক স্ক্রিন হিসেবে দেখা যাচ্ছিল। */
  async switchCamera() {
    if (!this.localStream || !this.isVideo) return null;
    this.currentCameraFacing = this.currentCameraFacing === 'user' ? 'environment' : 'user';

    const oldVideoTrack = this.localStream.getVideoTracks()[0];
    let newStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { exact: this.currentCameraFacing } }
      });
    } catch (e) {
      // exact facingMode অসমর্থিত হলে fallback, নাহলে ব্ল্যাক স্ক্রিন থেকে যাবে
      newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: this.currentCameraFacing }
      });
    }
    const newTrack = newStream.getVideoTracks()[0];

    for (const link of this.links.values()) {
      await link.replaceVideoTrack(newTrack);
    }

    if (oldVideoTrack) {
      oldVideoTrack.stop();
      this.localStream.removeTrack(oldVideoTrack);
    }
    this.localStream.addTrack(newTrack);
    return this.localStream;
  }

  getConnectedPeerIds() {
    return [...this._connectedPeers];
  }

  _cleanup() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    for (const link of this.links.values()) link.close();
    this.links.clear();
    this._connectedPeers.clear();
    this.localStream = null;
    this.pendingOffers = null;
    this.callLogId = null;
    this._callStartedAt = null;
    this.isGroup = false;
  }

  destroy() {
    this._cleanup();
    if (this.myChannel) supabase.removeChannel(this.myChannel);
  }
}
