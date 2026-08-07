/**
 * ইন-অ্যাপ সাউন্ড — ট্যাব খোলা থাকলে (ফোরগ্রাউন্ড/ব্যাকগ্রাউন্ড ট্যাব) কল রিং টোন লুপ করে
 * এবং নতুন মেসেজে ছোট্ট notification ping বাজায়। কোনো external mp3 ফাইলের উপর নির্ভর না
 * করে Web Audio API দিয়ে টোন সিন্থেসাইজ করা হয়েছে, যাতে অতিরিক্ত অ্যাসেট লোড/হোস্ট করার
 * দরকার না পড়ে। সম্পূর্ণ ট্যাব বন্ধ থাকলে এই মডিউল কাজ করবে না — সেটার জন্য Web Push
 * (push.js + service worker) ব্যবহার হচ্ছে।
 */
let audioCtx = null;
let ringInterval = null;
let ringGain = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(freq, startTime, duration, gainValue = 0.18) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainValue, startTime + 0.02);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/** ছোট্ট দুই-টোনের "ping" — নতুন মেসেজ এলে বাজে */
export function playMessagePing() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    playTone(880, now, 0.12, 0.15);
    playTone(1175, now + 0.09, 0.14, 0.15);
  } catch (e) {
    // অডিও কনটেক্সট তৈরি করা যায়নি (যেমন ব্যবহারকারী এখনো পেজে কোনো ইন্টারঅ্যাকশন করেননি) — নীরবে উপেক্ষা
  }
}

/** ক্রমাগত রিংটোন লুপ শুরু করুন (ইনকামিং কলের সময়) */
export function startRingtone() {
  stopRingtone();
  try {
    const ctx = getCtx();
    const cycle = () => {
      const now = ctx.currentTime;
      // WhatsApp-ঘরানার দুই-স্বরের রিং প্যাটার্ন
      playTone(740, now, 0.35, 0.2);
      playTone(880, now + 0.4, 0.35, 0.2);
    };
    cycle();
    ringInterval = setInterval(cycle, 1600);
  } catch (e) {
    // নীরবে উপেক্ষা
  }
}

export function stopRingtone() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
}

/** আউটগোয়িং কলের সময় হালকা "রিং হচ্ছে" টোন (কল করছেন এমন ব্যবহারকারীর জন্য) */
export function startOutgoingRingback() {
  stopRingtone();
  try {
    const ctx = getCtx();
    const cycle = () => {
      const now = ctx.currentTime;
      playTone(440, now, 1.0, 0.1);
    };
    cycle();
    ringInterval = setInterval(cycle, 3000);
  } catch (e) {
    // নীরবে উপেক্ষা
  }
}

/** পেজে প্রথম ট্যাপ/ক্লিকে AudioContext আনলক করুন (ব্রাউজার অটোপ্লে পলিসি এড়াতে) */
export function unlockAudioOnFirstInteraction() {
  const unlock = () => {
    try {
      getCtx();
    } catch {
      // ignore
    }
    document.removeEventListener('click', unlock);
    document.removeEventListener('touchstart', unlock);
  };
  document.addEventListener('click', unlock, { once: true });
  document.addEventListener('touchstart', unlock, { once: true });
}
