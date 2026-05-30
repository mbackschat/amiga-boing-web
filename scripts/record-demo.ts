// `npm run record` — produces docs/demo.mp4 (with sound) + docs/demo.gif
// (silent, derived from the MP4). End-to-end, single command. No host-level
// audio routing.
//
// Pipeline:
//   1. Spawn `vite preview` (port 4173). The build is assumed to be current
//      (the npm script chains `npm run build` first).
//   2. Launch headless Chromium via Playwright with viewport 1280×984
//      (matching #demo) and built-in video recording.
//   3. Navigate to /?record (loads src/record.ts; exposes start/stop globals).
//   4. Click to start the demo BEFORE recording, so the start overlay never
//      appears in the captured frames (key for seamless gif looping).
//   5. Start recording. Drive the sequence:
//      bounce → drag title bar down → settle → drag title bar back up to
//      splitY=600 → mouse returns to its starting position.
//   6. Pull the MediaRecorder audio blob out via page.evaluate.
//   7. Mux video + audio → docs/demo.mp4 (ffmpeg).
//   8. Derive docs/demo.gif from the MP4 via gifski (required).
//   9. Tear down preview server, clean tmp.

import { chromium, type ChromiumBrowser, type BrowserContext } from 'playwright';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');
const TMP        = path.join(ROOT, 'tmp-record');
const DOCS       = path.join(ROOT, 'docs');
const PREVIEW_PORT = 4173;

const MP4_PATH = path.join(DOCS, 'demo.mp4');
const GIF_PATH = path.join(DOCS, 'demo.gif');

async function main(): Promise<void> {
  checkTool('ffmpeg', true);
  checkTool('gifski', true, '--version');

  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  const preview = startPreview();
  try {
    await waitForPort(PREVIEW_PORT, 15_000);
    const seq = await runPlaywrightSequence();
    muxToMp4(seq, MP4_PATH);
    deriveGif(MP4_PATH, GIF_PATH);
    console.log(`\n  Wrote ${rel(MP4_PATH)}  (${humanSize(MP4_PATH)})`);
    console.log(`  Wrote ${rel(GIF_PATH)}  (${humanSize(GIF_PATH)})`);
  } finally {
    preview.kill('SIGTERM');
    fs.rmSync(TMP, { recursive: true, force: true });
  }
}

// -------- Subroutines --------

function checkTool(name: string, required: boolean, versionArg = '-version'): boolean {
  // ffmpeg wants `-version`; gifski (and most GNU tools) want `--version`.
  const result = spawnSync(name, [versionArg], { stdio: 'ignore' });
  const ok = result.status === 0;
  if (!ok && required) {
    console.error(`error: \`${name}\` not found on PATH. Install it and retry.`);
    process.exit(1);
  }
  return ok;
}

function startPreview(): ChildProcessWithoutNullStreams {
  // Spawn vite directly (not via `npm run`) — npm swallows `--` args in some
  // configurations and we need the explicit port.
  const child = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (b: Buffer) => process.stdout.write(`[preview] ${b}`));
  child.stderr.on('data', (b: Buffer) => process.stderr.write(`[preview!] ${b}`));
  return child;
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get({ host: 'localhost', port, path: '/', timeout: 1000 }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
    if (ok) return;
    await sleep(150);
  }
  throw new Error(`preview server didn't open port ${port} within ${timeoutMs}ms`);
}

interface SequenceResult {
  framesDir:  string;  // directory containing frame_NNNNN.jpg
  frameCount: number;
  audioPath:  string;
  totalSec:   number;  // wall-clock from start of recording to context close
  clickSec:   number;  // wall-clock offset at which audio actually starts
}

// Wait segments. The recording starts AFTER the click (no start overlay in
// captured frames), so the loop boundary is clean — first and last frames
// have the same WB splitY, the same cursor position, and no overlay.
const POST_CLICK_DELAY_MS = 150;   // wait for the overlay to clear
const INITIAL_SETTLE_MS   = 1200;  // ball bouncing, cursor at start position
const BEFORE_DRAG_MS      = 250;
const TO_TITLEBAR_MS      = 600;
const DRAG_DOWN_MS        = 1400;  // slow drag from splitY=600 → 924
const POST_DRAG_DOWN_MS   = 2000;  // settle with full Boing scene visible
const DRAG_UP_MS          = 1600;  // slow drag from splitY=924 → 600
const TO_START_POS_MS     = 600;
const FINAL_SETTLE_MS     = 1200;

const START_X = 640;
const START_Y = 400;  // initial click position; mouse returns here at the end
const DEFAULT_SPLIT_Y = 600;
const MAX_SPLIT_Y     = 924;  // drag to SPLIT_MAX=944 (924 + 20 px grab offset)
const TITLEBAR_GRAB_OFFSET_Y = 20;  // grab the title bar 20 px below its top

async function slowMove(
  page: import('playwright').Page,
  fromX: number, fromY: number,
  toX: number, toY: number,
  durationMs: number,
  steps = 30,
): Promise<void> {
  const dtMs = durationMs / steps;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = fromX + (toX - fromX) * t;
    const y = fromY + (toY - fromY) * t;
    await page.mouse.move(x, y);
    await page.waitForTimeout(dtMs);
  }
}

async function runPlaywrightSequence(): Promise<SequenceResult> {
  const browser: ChromiumBrowser = await chromium.launch();
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 984 },
    // No recordVideo — we use CDP `Page.startScreencast` instead, which
    // streams every page paint (up to 60 fps in headless) rather than the
    // ~18 fps Playwright's built-in recorder samples at. The demo's palette
    // cycles at 30 Hz, so anything under 30 fps capture rate makes the
    // ball's apparent rotation stutter.
  });
  const page = await context.newPage();

  const framesDir = path.join(TMP, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  let frameCount = 0;

  const cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', async (params: {
    data: string;
    sessionId: number;
    metadata: { timestamp?: number };
  }) => {
    const name = `frame_${String(frameCount).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(framesDir, name), Buffer.from(params.data, 'base64'));
    frameCount++;
    await cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId });
  });

  await page.goto(`http://localhost:${PREVIEW_PORT}/?record`);

  // Click to start the demo *before* recording begins. The first click both
  // unpauses physics and resumes the suspended AudioContext (browsers require
  // a user gesture). After this point the start overlay never re-appears, so
  // omitting it from the recording lets the gif loop seamlessly.
  await page.mouse.click(START_X, START_Y);
  await page.waitForTimeout(POST_CLICK_DELAY_MS);

  // Now start recording. t0 marks recording start; tClick = t0 since the
  // AudioContext is already resumed.
  await page.evaluate(() => window.__startRecording!());
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: 1280,
    maxHeight: 984,
    everyNthFrame: 1,
  });

  const t0 = Date.now();
  const tClick = t0;

  // Initial settle — ball bouncing, mouse at the start position.
  await page.waitForTimeout(INITIAL_SETTLE_MS);

  // Mouse glides down to the title bar (at splitY=600 → band 600..640).
  const grabDownY = DEFAULT_SPLIT_Y + TITLEBAR_GRAB_OFFSET_Y;  // 620
  await slowMove(page, START_X, START_Y, START_X, grabDownY, TO_TITLEBAR_MS);
  await page.waitForTimeout(BEFORE_DRAG_MS);

  // Slow drag down to splitY≈MAX_SPLIT_Y (title bar at viewport y≈944).
  await page.mouse.down();
  await slowMove(
    page,
    START_X, grabDownY,
    START_X, MAX_SPLIT_Y + TITLEBAR_GRAB_OFFSET_Y,  // 944
    DRAG_DOWN_MS,
  );
  await page.mouse.up();
  await page.waitForTimeout(POST_DRAG_DOWN_MS);

  // Slow drag back UP to the default splitY=600. The title bar is now at
  // splitY=MAX_SPLIT_Y, so we grab it 20 px below its current top.
  const grabUpY = MAX_SPLIT_Y + TITLEBAR_GRAB_OFFSET_Y;  // 944
  await page.mouse.down();
  await slowMove(
    page,
    START_X, grabUpY,
    START_X, grabDownY,
    DRAG_UP_MS,
  );
  await page.mouse.up();
  await page.waitForTimeout(BEFORE_DRAG_MS);

  // Mouse returns to its starting position. After this, the screen state
  // (WB at splitY=600, cursor at START_X/START_Y) matches the first frame.
  await slowMove(page, START_X, grabDownY, START_X, START_Y, TO_START_POS_MS);
  await page.waitForTimeout(FINAL_SETTLE_MS);

  await cdp.send('Page.stopScreencast');

  const audioBase64 = await page.evaluate(() => window.__stopRecording!());
  const audioPath = path.join(TMP, 'audio.webm');
  fs.writeFileSync(audioPath, Buffer.from(audioBase64, 'base64'));

  await context.close();
  await browser.close();

  const totalSec = (Date.now() - t0) / 1000;
  const clickSec = (tClick   - t0) / 1000;

  return { framesDir, frameCount, audioPath, totalSec, clickSec };
}

function muxToMp4(seq: SequenceResult, out: string): void {
  // Frames were captured at every page paint via CDP screencast. Average
  // capture rate = frameCount / totalSec — feed it back to ffmpeg as the
  // input frame rate so the encoded video runs at wall-clock speed.
  // The audio recording skipped the pre-roll (AudioContext was suspended),
  // so delay it by `clickSec` to align impacts with the right video frame.
  const fps     = seq.frameCount / seq.totalSec;
  const delayMs = Math.round(seq.clickSec * 1000);
  console.log(
    `  ${seq.frameCount} frames over ${seq.totalSec.toFixed(2)}s → ${fps.toFixed(2)} fps; ` +
    `audio delayed ${delayMs} ms`,
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  run('ffmpeg', [
    '-y',
    '-framerate', fps.toFixed(3),
    '-i', path.join(seq.framesDir, 'frame_%05d.jpg'),
    '-i', seq.audioPath,
    '-filter:a', `adelay=${delayMs}|${delayMs}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '128k',
    '-t', seq.totalSec.toFixed(3),
    out,
  ]);
}

function deriveGif(mp4: string, gif: string): void {
  fs.mkdirSync(path.dirname(gif), { recursive: true });
  // gifski reads PNG frames. Extract them with ffmpeg into a DEDICATED dir —
  // NOT the screencast `frames/` dir, which still holds the 725 capture JPGs
  // (mixing them in would feed gifski a mis-sorted JPG+PNG pile).
  const gifFramesDir = path.join(TMP, 'gif-frames');
  fs.rmSync(gifFramesDir, { recursive: true, force: true });
  fs.mkdirSync(gifFramesDir, { recursive: true });
  run('ffmpeg', [
    '-y', '-i', mp4,
    '-vf', 'fps=24,scale=640:-1:flags=neighbor',
    path.join(gifFramesDir, 'frame_%04d.png'),
  ]);
  const frames = fs.readdirSync(gifFramesDir)
    .filter(f => f.endsWith('.png')).sort()
    .map(f => path.join(gifFramesDir, f));
  run('gifski', ['--quality', '95', '--fps', '24', '-o', gif, ...frames]);
}

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} → exit ${r.status}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function rel(p: string): string { return path.relative(ROOT, p); }
function humanSize(p: string): string {
  const b = fs.statSync(p).size;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
