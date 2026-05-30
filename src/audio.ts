import type { Impact } from './physics.ts';
// `?url` returns a string the runtime can fetch. With assetsInlineLimit set
// to >24KB in vite.config.ts, the build inlines this as a base64 data URL —
// which lets fetch() succeed under file:// in every browser.
import sampleUrl from './boing.samples?url';

const NATIVE_RATE = 22050;
const FLOOR_RATE  = 14036 / NATIVE_RATE;   // Paula period 255 → ~14036 Hz
const WALL_RATE   = 22372 / NATIVE_RATE;   // Paula period 160 → ~22372 Hz
const FLOOR_VOL   = 1.0;                   // _bvolume 63/63
const WALL_VOL    = 40 / 63;               // _svolume 40/63
const BALANCE_MAX = 54613;
const MAX_DELAY_SEC = 0.006;

const audioCtx = new AudioContext();
let audioBuf: AudioBuffer | null = null;

// Single tap-off point between impact sources and the speaker output.
// triggerImpact() routes every gain stage through masterGain → destination.
// `tapMaster()` (used only by the recording shim) hooks a MediaStream off
// masterGain so audio can be captured without OS-level routing.
const masterGain = audioCtx.createGain();
masterGain.connect(audioCtx.destination);

let streamDest: MediaStreamAudioDestinationNode | null = null;
export function tapMaster(): MediaStream {
  if (!streamDest) {
    streamDest = audioCtx.createMediaStreamDestination();
    masterGain.connect(streamDest);
  }
  return streamDest.stream;
}

(async () => {
  const arr = await (await fetch(sampleUrl)).arrayBuffer();
  // 2-byte header, then 8-bit signed PCM mono.
  const pcm = new Int8Array(arr, 2);
  const ab = audioCtx.createBuffer(1, pcm.length, NATIVE_RATE);
  const ch = ab.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 128;
  audioBuf = ab;
})();

// Modern browsers start the AudioContext suspended until a user gesture.
// main.ts calls this on the user's first interaction.
export function resumeAudio(): void {
  if (audioCtx.state !== 'running') void audioCtx.resume();
}

export function triggerImpact(kind: Impact, ballX: number): void {
  if (!audioBuf || kind === null) return;

  let balance: number;
  let vol: number;
  let rate: number;
  if (kind === 'floor') {
    // Sound spatializes opposite to ball position — impact comes from under
    // the ball. Convert screen-X (centered on 160) to signed offset first.
    const signedX = ballX - 160;
    balance = -signedX * 384;
    vol     = FLOOR_VOL;
    rate    = FLOOR_RATE;
  } else if (kind === 'wall-left') {
    balance = +30000;   // ball at left wall → sound from right
    vol     = WALL_VOL;
    rate    = WALL_RATE;
  } else {
    balance = -30000;
    vol     = WALL_VOL;
    rate    = WALL_RATE;
  }

  // Amiga `balance` is positive-left / negative-right; WebAudio StereoPanner
  // is positive-right / negative-left. Negate to flip into WebAudio's frame
  // so the lead channel lands on the same side as the impact.
  const absBal     = Math.abs(balance);
  const pan        = Math.max(-1, Math.min(1, -balance / BALANCE_MAX));
  const panSign    = pan < 0 ? -1 : pan > 0 ? 1 : 0;
  const leadGain   = vol;
  const followGain = vol * Math.max(0, (BALANCE_MAX - absBal) / BALANCE_MAX);
  const delaySec   = Math.abs(pan) * MAX_DELAY_SEC;

  const leadSrc  = audioCtx.createBufferSource();
  leadSrc.buffer = audioBuf;
  leadSrc.playbackRate.value = rate;
  const leadPan  = audioCtx.createStereoPanner();
  leadPan.pan.value = panSign;
  const leadG    = audioCtx.createGain();
  leadG.gain.value = leadGain;
  leadSrc.connect(leadPan).connect(leadG).connect(masterGain);
  leadSrc.start();

  if (followGain > 0.001) {
    const followSrc = audioCtx.createBufferSource();
    followSrc.buffer = audioBuf;
    followSrc.playbackRate.value = rate;
    const delay = audioCtx.createDelay(0.05);
    delay.delayTime.value = delaySec;
    const followPan = audioCtx.createStereoPanner();
    followPan.pan.value = -panSign;
    const followG = audioCtx.createGain();
    followG.gain.value = followGain;
    followSrc.connect(delay).connect(followPan).connect(followG).connect(masterGain);
    followSrc.start();
  }
}
