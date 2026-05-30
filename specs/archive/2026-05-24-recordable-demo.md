# Recordable demo — MP4 with sound + derived GIF

**Date:** 2026-05-24
**Status:** completed (2026-05-24)
**Depends on:** completed Workbench spec `specs/archive/2026-05-24-workbench-split-screen.md` (for the drag UX captured in the sequence).

---

## Intent

`npm run record` produces, end-to-end:

- **`docs/demo.mp4`** — full-fidelity capture (1280×800, 30 fps) of a scripted sequence: open the page (overlay visible) → click to start → 2 s of bouncing → drag the Workbench title bar from `splitY = 600` to `splitY = 400` (1/4 → 1/2 visible) → 2 s settling. With **audio** — the canonical "BOING!" impacts captured straight from WebAudio.
- **`docs/demo.gif`** — silent, 640×400, 24 fps, derived from `demo.mp4`. Suitable for inline `<img>` embedding in README and on GitHub.

Both artifacts are reproducible on demand whenever the code changes. Single command, no host-level audio routing, no manual steps. The MP4 stays the source of truth; the GIF is a deterministic post-process so the two never drift.

---

## Scope

### In scope

- A Playwright script that drives the scripted sequence in headless Chromium.
- An in-page audio tap (small refactor of `src/audio.ts`) feeding a `MediaRecorder` so audio is captured without any OS-level routing.
- ffmpeg muxing of separately-captured audio + video into `demo.mp4`.
- gifski (or ffmpeg fallback) for deriving `demo.gif` from the MP4.
- A `?record` URL flag that loads the recording shim; the normal runtime bundle is unaffected (shim is a dynamic import).
- npm script `record` that handles build → preview server → Playwright → ffmpeg → cleanup.

### Out of scope

- OS-level audio routing (BlackHole, PulseAudio). The whole point of the in-page tap is to avoid this.
- CI integration. `npm run record` is manual for now; documented in README + IMPLEMENTATION.md.
- Capturing the user's microphone or system-wide audio.
- Multiple output formats beyond MP4 + GIF.
- A live "record" button in the demo UI. Recording is a developer/build-time concern only.

---

## Design

Three layers, in execution order:

1. **In-page** (`src/audio.ts` + new `src/record.ts`) — audio capture via WebAudio MediaStreamDestination + MediaRecorder.
2. **Playwright orchestration** (`scripts/record-demo.ts`) — drives the page, captures video, reads the audio blob.
3. **Post-process** (also in `record-demo.ts`) — ffmpeg mux + gifski/ffmpeg derive.

### 3.1 `audio.ts` refactor — insert `masterGain`

Current audio topology:

```
leadSrc   → leadPan   → leadG   → audioCtx.destination
followSrc → delay → followPan → followG → audioCtx.destination
```

New topology:

```
leadSrc   → leadPan   → leadG   ↘
                                 masterGain → audioCtx.destination
followSrc → delay → followPan → followG ↗            ↘
                                                      → streamDest (only when tapMaster called)
```

A single `masterGain` node sits between the per-impact gain stages and the destination. Default behavior is unchanged. `tapMaster()` is added as an exported function that connects `masterGain` to a freshly-allocated `MediaStreamDestinationNode` and returns the resulting `MediaStream`. Idempotent — calling tapMaster repeatedly returns the same stream.

About 8 lines added to `audio.ts`. Touch the existing `connect(audioCtx.destination)` calls to point at `masterGain` instead.

### 3.2 `src/record.ts` — the recording shim

Loaded only when `location.search.includes('record')`. Exposes two globals for Playwright:

```ts
import { tapMaster } from './audio.ts';

let recorder: MediaRecorder | null = null;
const chunks: Blob[] = [];

(window as any).__startRecording = (): void => {
  const stream = tapMaster();
  recorder = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start();
};

(window as any).__stopRecording = (): Promise<ArrayBuffer> =>
  new Promise((resolve) => {
    if (!recorder) { resolve(new ArrayBuffer(0)); return; }
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      resolve(await blob.arrayBuffer());
    };
    recorder.stop();
  });
```

In `main.ts`, after the existing setup:

```ts
if (location.search.includes('record')) void import('./record.ts');
```

Vite tree-shakes the dynamic import — the recording code never lands in the normal build's bundle.

### 3.3 Playwright orchestration

`scripts/record-demo.ts` runs as a Node script (via `tsx`). Sequence:

```
1. Wipe + recreate `tmp-record/`.
2. Spawn `vite preview` on port 4173. Wait for port-ready.
3. Launch headless Chromium with viewport 1280×800 and `recordVideo: { dir: tmp-record/, size: 1280×800 }`.
4. Navigate to http://localhost:4173/?record.
5. page.evaluate(() => __startRecording())  — audio recording begins (silent until AudioContext resumes).
6. page.waitForTimeout(1000)                — overlay visible.
7. page.mouse.click(640, 400)               — click on Boing area; starts demo + resumes AudioContext.
8. page.waitForTimeout(2000)                — 2 s of bouncing.
9. page.mouse.move(640, 620);
   page.mouse.down();
   page.mouse.move(640, 420, { steps: 30 }); — smooth drag over ~500 ms.
   page.mouse.up();                          — drops Workbench title bar at splitY=400 (half visible).
10. page.waitForTimeout(2000)               — 2 s post-drag.
11. const audioBuf = await page.evaluate(() => __stopRecording());
12. Write audioBuf → tmp-record/audio.webm.
13. context.close() → Playwright writes the video as tmp-record/<random>.webm.
14. browser.close().
15. Mux: ffmpeg -i <video> -i audio.webm -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest docs/demo.mp4.
16. Derive GIF — gifski if on PATH, otherwise ffmpeg palettegen/paletteuse, both at fps=24 scale=640.
17. Kill preview server. Remove tmp-record/.
```

Total recording length: ≈ 5.0 s (1 s overlay + 2 s bounce + 0.5 s drag + 2 s post-drag). Click on the canvas at (640, 400) is in the Boing band so the existing start handler fires.

### 3.4 npm wiring

```json
"scripts": {
  "record": "npm run build && tsx scripts/record-demo.ts"
}
"devDependencies": {
  ...
  "playwright": "^1.48.0",
  "tsx": "^4.19.0"
}
```

Playwright auto-downloads its Chromium on `npm install`. ~150 MB in `node_modules/`; not committed.

### 3.5 `.gitignore`

```
tmp-record/
```

### 3.6 Tool dependency checks

The script's first action after parsing argv: shell out to `ffmpeg -version` and `gifski --version`. Fail fast with a helpful message if `ffmpeg` is missing (mandatory) or `gifski` is missing (falls back to ffmpeg-only with a one-line note).

---

## Implementation plan

- [ ] **Refactor `src/audio.ts`** to insert `masterGain` and export `tapMaster()`. Verify the demo still sounds the same with no `?record`.
- [ ] **Add `src/record.ts`** with the `__startRecording` / `__stopRecording` globals.
- [ ] **Add the conditional import** to `src/main.ts`.
- [ ] **Add `scripts/record-demo.ts`** with the Playwright + ffmpeg pipeline.
- [ ] **`npm i -D playwright tsx`**. Verify Playwright pulls its Chromium.
- [ ] **Add `record` script** to `package.json`.
- [ ] **`.gitignore`** — add `tmp-record/`.
- [ ] **`npm run record`** — iterate until `docs/demo.mp4` and `docs/demo.gif` look right (timing, alignment, file size).
- [ ] **Update `README.md`** — embed `docs/demo.gif` near the top, link `docs/demo.mp4` for sound.
- [ ] **Update `docs/IMPLEMENTATION.md`** — new §10.3 "Recording pipeline" describing the audio tap + Playwright orchestration + ffmpeg pipeline.
- [ ] **Update `CLAUDE.md` "Running"** to mention `npm run record` alongside `dev` / `build`.
- [ ] **Move spec to `specs/archive/`** with `Status: completed` and the Notes from implementation filled.

---

## References

- `src/audio.ts:5` — sample inlining pattern; where the `masterGain` refactor lands.
- `src/main.ts` — conditional dynamic import insertion point.
- `src/workbench.ts` — splitY constants used by the drag sequence (`SPLIT_INITIAL = 600`, title bar band `splitY..splitY+40`).
- Playwright [`Mouse` API](https://playwright.dev/docs/api/class-mouse), [video recording](https://playwright.dev/docs/videos).
- [gifski](https://gif.ski/) — high-quality GIF encoder.
- ffmpeg [palettegen](https://ffmpeg.org/ffmpeg-filters.html#palettegen) + [paletteuse](https://ffmpeg.org/ffmpeg-filters.html#paletteuse) for the ffmpeg-fallback path.

---

## Open questions — resolved as defaults from the prior discussion

1. ✓ **Resolution.** MP4 1280×800 (native demo size); GIF 640×400 (half).
2. ✓ **Frame rate.** Playwright captures video at its native rAF cadence (effectively 30 fps in headless Chromium); GIF derived at 24 fps.
3. ✓ **Length.** ≈ 5 s (1 s overlay + click + 2 s bouncing + drag + 2 s post-drag).
4. ✓ **Output paths.** `docs/demo.mp4` + `docs/demo.gif`.
5. ✓ **gifski vs ffmpeg.** gifski preferred when on PATH; ffmpeg palettegen/paletteuse as fallback.
6. ✓ **CI.** Skip for now; document `npm run record` as a manual step.
7. ✓ **Audio strategy.** In-page WebAudio tap → MediaRecorder. No OS-level audio routing.

---

## Notes from implementation

Filled during implementation on 2026-05-24.

### Followed exactly

- audio.ts refactor — added `masterGain` between every impact's gain stage and `audioCtx.destination`, plus exported `tapMaster()`. ~12 lines, no observable behavior change for the normal demo.
- `src/record.ts` shim — `MediaRecorder` on the `tapMaster()` stream, `__startRecording` / `__stopRecording` globals.
- Dynamic import in `main.ts` gated on `location.search.includes('record')`.
- Playwright sequence — 1 s overlay, click `(640, 400)`, 2 s, drag `(640, 620) → (640, 420)` over 30 steps, 2 s. Total ≈ 5 s.
- ffmpeg mux + gifski-with-ffmpeg-fallback derive — both paths tested.

### Deviations / surprises

- **`page.evaluate` can't return `ArrayBuffer` directly.** First attempt returned the audio blob's `ArrayBuffer` to Playwright — got `TypeError: The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received an instance of Object`. Playwright serializes evaluate results over the Chrome DevTools Protocol, which doesn't know about `ArrayBuffer`. Workaround: convert to base64 in-page (`btoa(String.fromCharCode(...bytes))`), decode in Node (`Buffer.from(base64, 'base64')`). Three extra lines on each side.
- **`spawn('npm', ['run', 'preview', '--', ...])` didn't pass `--` args.** First attempt couldn't get vite to bind to the explicit port — npm was swallowing the args. Switched to `spawn('npx', ['vite', 'preview', '--port', ..., '--strictPort'])` directly. Cleaner anyway: no shell layer.
- **`net.connect(port, '127.0.0.1')` couldn't reach the preview server** even after vite reported it was listening on `http://localhost:4173/`. Suspect vite binds only to `::1` (IPv6 loopback) in this environment, not `127.0.0.1`. Switched the ready-probe to `http.get({ host: 'localhost', port })` which lets Node resolve both v4 and v6.
- **Without `gifski`, the GIF is ~3 MB** (the ffmpeg `palettegen` + `paletteuse` path is OK but not great). `gifski` typically gets the same content to ~500 KB at the same quality. Spec called it "preferred"; in practice it's worth installing (`brew install gifski`) before recording.
- **Bundle grows ~2 KB even when `?record` isn't used.** `vite-plugin-singlefile` inlines all chunks regardless of whether the dynamic import fires — the conditional `import('./record.ts')` doesn't keep it out of the bundle, just out of the execution path. Trade is acceptable; the alternative would be a separate "recording build" target which is more complexity than the ~2 KB is worth.
- **Three time scales had to be reconciled in the mux step** — bug that landed the first time and only surfaced when the user spotted that the post-drag 2-second wait looked shortened. (a) Playwright's headless `recordVideo` samples at ≈ 18 fps but encodes at 25 fps, so its raw playback duration isn't wall-clock. (b) `MediaRecorder` on the WebAudio tap doesn't emit data while the `AudioContext` is suspended, so the audio file starts at the first click rather than at navigation. (c) ffmpeg's `-shortest` then clipped output to whichever stream finished first, losing whichever post-drag tail was longer. **Fix:** the Playwright script tracks `t0` and `tClick` wall-clock timestamps, delays the audio by `clickSec` via `adelay`, and `-t totalSec` caps the output. The mux step logs the corrections it applied so future drift is easy to spot.
- **Playwright's `recordVideo` made the ball rotation look jerky** — user-reported. At ≈ 18 fps capture but a 30 Hz palette cycle in the demo, the video aliased nearly every other palette step. **Fix:** swapped `recordVideo` out for **CDP `Page.startScreencast`** with `everyNthFrame: 1`, which streams every page paint (now ≈ 72 fps in headless). The mux step encodes from the JPEG frame sequence with `-framerate (frameCount/totalSec)` so playback is at wall-clock speed regardless of the actual capture rate. Bonus: smaller MP4 and GIF (no double-encoding through Chromium's tracing format).
- **Cursor teleported between click and drag-grab.** First version did `page.mouse.click(640,400)` then `page.mouse.move(640,620)` without `steps`, so the pointer instantly jumped 220 px down the screen — looked unnatural. Adding `{ steps: 40 }` to the move (and the drag itself) gives ~700 ms of visible cursor travel each.
- **Defaults doubled after first review.** Original spec said 1 s pre-roll, 2 s bounce, 2 s post-drag. User asked for 2 × on each (2 / 4 / 4) because the shorter values played too fast to read. Total recording now ~11.6 s.

### Lessons

- **Recording is the kind of feature that benefits most from `?record`-flag gating.** Anything that adds non-trivial code to the runtime — and isn't part of the user experience — should be loaded conditionally. Even if the bundler ends up keeping the code (as with vite-plugin-singlefile), the conditional execution boundary stops the recording infrastructure from running in normal sessions.
- **In-page audio capture beats OS-level routing for reproducibility.** Tapping the WebAudio graph via `MediaStreamDestination` works the same on macOS, Linux, and CI containers — no BlackHole / PulseAudio setup. The only cost was the tiny `masterGain` refactor.
- **Playwright's video recording is sufficient for visuals**, but its serialization boundary is narrower than expected (no ArrayBuffer). Always pre-serialize binary data to base64 when crossing the page/Node boundary.
- **`npx vite ...` is more reliable than `npm run ...` in subprocess spawns** when you need to pass arguments. npm's `--` arg-passing is finicky depending on npm version + the script's exec layer; npx bypasses that.
