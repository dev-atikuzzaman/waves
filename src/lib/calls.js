import { supabase } from './supabase.js';

const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

const turnUrl = import.meta.env.VITE_TURN_URL;
if (turnUrl) {
  iceServers.push({
    urls: turnUrl,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL
  });
}

/**
 * প্রতিটি ব্যবহারকারীর নিজস্ব সিগন্যালিং চ্যানেল (broadcast, DB-তে সেভ হয় না)।
 * কল করার সময় পিয়ারের চ্যানেলে অফার/আনসার/ICE পাঠানো হয়।
 */
function userChannelName(userId) {
  return `signal:${userId}`;
}

export class CallManager {
  constructor({ myId, onIncomingCall, onStateChange, onRemoteStream }) {
    this.myId = myId;
    this.onIncomingCall = onIncomingCall;
    this.onStateChange = onStateChange; // 'ringing' | 'connecting' | 'connected' | 'ended'
    this.onRemoteStream = onRemoteStream;
    this.pc = null;
    this.localStream = null;
    this.peerId = null;
    this.isVideo = false;
    this.myChannel = null;

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
    await channel.subscribe(); // send-only subscribe is fine for broadcast
    await channel.send({ type: 'broadcast', event: 'signal', payload: { ...payload, from: this.myId } });
    supabase.removeChannel(channel);
  }

  async _handleSignal(payload) {
    if (payload.from === this.myId) return;

    switch (payload.kind) {
      case 'call-offer': {
        this.peerId = payload.from;
        this.isVideo = payload.video;
        this.pendingOffer = payload.sdp;
        this.onIncomingCall?.({ from: payload.from, video: payload.video });
        break;
      }
      case 'call-answer': {
        if (this.pc) await this.pc.setRemoteDescription(payload.sdp);
        this.onStateChange?.('connected');
        break;
      }
      case 'ice-candidate': {
        if (this.pc && payload.candidate) {
          try {
            await this.pc.addIceCandidate(payload.candidate);
          } catch (e) {
            console.warn('ICE candidate error', e);
          }
        }
        break;
      }
      case 'call-end': {
        this.hangUp(false);
        break;
      }
      case 'call-decline': {
        this.onStateChange?.('ended');
        this._cleanup();
        break;
      }
    }
  }

  async _createPeerConnection() {
    this.pc = new RTCPeerConnection({ iceServers });

    this.pc.onicecandidate = (e) => {
      if (e.candidate && this.peerId) {
        this._sendSignal(this.peerId, { kind: 'ice-candidate', candidate: e.candidate });
      }
    };

    this.pc.ontrack = (e) => {
      this.onRemoteStream?.(e.streams[0]);
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'connected') this.onStateChange?.('connected');
      if (['failed', 'disconnected', 'closed'].includes(this.pc.connectionState)) {
        this.onStateChange?.('ended');
      }
    };
  }

  async startCall(peerId, video = false) {
    this.peerId = peerId;
    this.isVideo = video;
    await this._createPeerConnection();

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { facingMode: 'user' } : false
    });
    this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream));

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    await this._sendSignal(peerId, { kind: 'call-offer', sdp: offer, video });
    this.onStateChange?.('ringing');
    return this.localStream;
  }

  async acceptCall() {
    await this._createPeerConnection();

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: this.isVideo ? { facingMode: 'user' } : false
    });
    this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream));

    await this.pc.setRemoteDescription(this.pendingOffer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    await this._sendSignal(this.peerId, { kind: 'call-answer', sdp: answer });
    this.onStateChange?.('connecting');
    return this.localStream;
  }

  declineCall() {
    if (this.peerId) this._sendSignal(this.peerId, { kind: 'call-decline' });
    this._cleanup();
  }

  hangUp(notifyPeer = true) {
    if (notifyPeer && this.peerId) this._sendSignal(this.peerId, { kind: 'call-end' });
    this.onStateChange?.('ended');
    this._cleanup();
  }

  toggleMic(enabled) {
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  }

  toggleCam(enabled) {
    this.localStream?.getVideoTracks().forEach((t) => (t.enabled = enabled));
  }

  _cleanup() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream = null;
    this.peerId = null;
    this.pendingOffer = null;
  }

  destroy() {
    this._cleanup();
    if (this.myChannel) supabase.removeChannel(this.myChannel);
  }
}
