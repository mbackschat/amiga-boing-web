// In-page recording shim. Loaded only when the URL has `?record`
// (dynamic-imported from main.ts), so the normal runtime bundle never
// includes it. Playwright calls `__startRecording()` to begin capturing
// the WebAudio master tap, then `__stopRecording()` to receive the
// audio blob as an ArrayBuffer.
import { tapMaster } from './audio.ts';

let recorder: MediaRecorder | null = null;
const chunks: Blob[] = [];

declare global {
  interface Window {
    __startRecording?: () => void;
    // Returns base64 of the recorded webm/opus audio. Base64 because
    // ArrayBuffer doesn't survive Playwright's page.evaluate serialization.
    __stopRecording?: () => Promise<string>;
  }
}

window.__startRecording = (): void => {
  const stream = tapMaster();
  recorder = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start();
};

window.__stopRecording = (): Promise<string> =>
  new Promise((resolve) => {
    if (!recorder) { resolve(''); return; }
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
      resolve(btoa(binary));
    };
    recorder.stop();
  });
