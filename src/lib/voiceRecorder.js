/** ভয়েস নোট রেকর্ড করার জন্য হালকা wrapper (MediaRecorder API) */
export class VoiceRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
    this.startedAt = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    this.mediaRecorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
    this.startedAt = Date.now();
  }

  /** রেকর্ডিং থামান এবং { file, durationSeconds } রিটার্ন করুন */
  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) return resolve(null);
      this.mediaRecorder.onstop = () => {
        const durationSeconds = Math.round((Date.now() - this.startedAt) / 1000);
        const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        this.stream?.getTracks().forEach((t) => t.stop());
        resolve({ file, durationSeconds });
      };
      this.mediaRecorder.stop();
    });
  }

  cancel() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}
