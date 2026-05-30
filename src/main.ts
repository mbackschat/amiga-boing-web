import { initPalette, stepPalette } from './palette.ts';
import { composite } from './composite.ts';
import { buildRoom } from './room.ts';
import { generateVertices, drawShadow, drawFacets } from './ball.ts';
import { ball, stepPhysics } from './physics.ts';
import { startLoop } from './loop.ts';
import { triggerImpact, resumeAudio } from './audio.ts';
import { drawText } from './font.ts';
import { initWorkbench, setBoingForward, toggleBoingForward } from './workbench.ts';
import { initCursor } from './cursor.ts';

// Recording shim loads only when the URL has `?record` — used by
// `scripts/record-demo.ts` (Playwright) to capture audio in-page.
// Vite tree-shakes the dynamic import out of the normal bundle.
if (location.search.includes('record')) void import('./record.ts');

const W = 320, H = 216;
const BALL_W = 336, BALL_H = 216;
const PROJ_CX = 168;
const PROJ_CY = 108;

const demo = document.getElementById('demo') as HTMLDivElement;
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const imageData = ctx.createImageData(W, H);

initWorkbench(demo);
initCursor(demo);

// Position + scale the demo wrapper to fit any viewport without clipping.
// `#demo` is position:fixed with transform-origin: top-left, so left/top set
// where the scaled wrapper's top-left corner lands, and `transform: scale`
// shrinks it. At ≥ 1280×984 viewport the scale is 1 (pixel-perfect); below
// that, integer-aware nearest-neighbor scaling keeps the chunky look readable.
const WRAPPER_W = 1280;
const WRAPPER_H = 984;
function fitToViewport(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scale = Math.min(w / WRAPPER_W, h / WRAPPER_H, 1);
  const visibleW = WRAPPER_W * scale;
  const visibleH = WRAPPER_H * scale;
  demo.style.left = `${(w - visibleW) / 2}px`;
  demo.style.top  = `${(h - visibleH) / 2}px`;
  demo.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitToViewport);
fitToViewport();

const ballBuf = new Uint8Array(BALL_W * BALL_H);
const bgBuf = new Uint8Array(W * H);

initPalette();
buildRoom(bgBuf, W, H);
generateVertices();
drawShadow(ballBuf, BALL_W, BALL_H);
drawFacets(ballBuf, BALL_W, BALL_H);

// Demo waits for the user's first interaction so the AudioContext can
// resume and the first bounce is audible.
let started = false;
let paused = true;

function interact(): void {
  if (!started) {
    started = true;
    paused = false;
    resumeAudio();
    return;
  }
  paused = !paused;
}

window.addEventListener('click', interact);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    interact();
  } else if (e.code === 'KeyF') {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void canvas.requestFullscreen();
  } else if (e.code === 'Tab') {
    e.preventDefault();
    toggleBoingForward();
  } else if (e.code === 'Escape') {
    setBoingForward(false);
  }
});

startLoop(
  () => {
    if (paused) return;
    const impact = stepPhysics();
    if (impact) triggerImpact(impact, ball.x);
    stepPalette(ball.rotPhase, ball.vx >= 0 ? 1 : -1);
  },
  () => {
    const offX = PROJ_CX - Math.round(ball.x);
    const offY = PROJ_CY - Math.round(ball.y);
    composite(ballBuf, BALL_W, BALL_H, bgBuf, offX, offY, imageData, W, H);
    ctx.putImageData(imageData, 0, 0);
    if (!started) {
      // Two 16-px-tall lines placed in the gap between wireframe horizontals
      // at Y=112 / 128 / 144 so the magenta lines don't cut through the text.
      // White fill + black outline keeps it legible against both the grey
      // sky and the magenta verticals.
      drawText(ctx, 80, 112, 'CLICK OR PRESS SPACE', '#ffffff', '#000000');
      drawText(ctx, 128, 128, 'TO START', '#ffffff', '#000000');
    }
  },
);
