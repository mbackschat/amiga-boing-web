// The Workbench 1.3 screen-drag overlay. The image lives in a hi-res DOM
// layer pinned to the demo wrapper at 2× horizontal / 4× vertical CSS scale
// (so pixels are half-wide compared to Boing's lo-res, the canonical Amiga
// hi-res non-interlaced look — the Copper mid-frame mode switch).
//
// `splitY` is the CSS Y of the title bar's top edge inside the 1280×800
// demo viewport. The image's `top` is bound to `splitY` from JS — the whole
// image translates with the drag, exactly like an Amiga screen-drag, where
// the title bar lives at screen Y = splitY and the desktop extends downward.
//
// Screen Z-order: two states. **State A** (`boingForward = false`, default)
// is the original — Workbench in front, draggable. **State B** is Boing
// fully forward, Workbench hidden via `display: none`. The user enters B by
// clicking the right-hand depth gadget in the WB title bar, and returns to A
// by clicking the matching phantom hit box at the top-right of the Boing
// canvas (or via Esc / Tab from main.ts). `splitY` is preserved across
// transitions.
import workbenchUrl from './workbench.png?url';

// Title bar is the top ~10 rows of the hi-res image; at 4× vertical CSS that's 40 px.
const WB_TITLE_BAR_PX  = 10;
const WB_TITLE_BAR_CSS = WB_TITLE_BAR_PX * 4;

// Wrapper is 984 CSS tall — 864 for the 320×216 Boing canvas + a 120 CSS px
// sky strip beneath it (an 80px gap = 2× WB title-bar height, then the 40px
// header) so the WB title bar at maximum drag-down lands fully below the
// canvas without overlapping the front-floor edge (native Y=215 / CSS 860).
const VIEWPORT_HEIGHT_CSS = 984;
const SPLIT_MIN = 0;
const SPLIT_MAX = VIEWPORT_HEIGHT_CSS - WB_TITLE_BAR_CSS;
const SPLIT_INITIAL = 600;

// Right-hand depth gadget in the WB title bar (send-to-back). Native pixel
// ranges on the 640×200 source bitmap; CSS scale is 2× horizontal / 4×
// vertical. Generous-by-one on each side — the user's click should land
// even if the visible gadget glyph is a pixel or two off.
const WB_GADGET_BACK_X     = 614 * 2;                  // 1228 CSS x, wrapper-local
const WB_GADGET_BACK_W     = (637 - 614 + 1) * 2;      // 48 CSS width
const WB_GADGET_BACK_Y_REL = 1 * 4;                    // 4 CSS y relative to title-bar top
const WB_GADGET_BACK_H     = (8 - 1 + 1) * 4;          // 32 CSS height

let splitY = SPLIT_INITIAL;
let dragOffset = 0;
let dragging = false;
// Suppress the next click event when a drag actually moved the title bar, or
// when a gadget/phantom press resolved a state transition — in either case
// the click shouldn't also bubble to the window-level pause toggle.
let suppressNextClick = false;
let boingForward = false;

// Gadget/phantom press latches — set on pointerdown inside the hit box;
// only fire the state transition if pointerup also lands inside.
let pressedGadget = false;
let pressedPhantom = false;

let wbImg: HTMLImageElement | null = null;
let hintEl: HTMLDivElement | null = null;

function applyPosition(): void {
  if (wbImg) wbImg.style.top = `${splitY}px`;
}

function inGadget(x: number, y: number): boolean {
  return (
    x >= WB_GADGET_BACK_X &&
    x <  WB_GADGET_BACK_X + WB_GADGET_BACK_W &&
    y >= splitY + WB_GADGET_BACK_Y_REL &&
    y <  splitY + WB_GADGET_BACK_Y_REL + WB_GADGET_BACK_H
  );
}

function inPhantom(x: number, y: number): boolean {
  return (
    x >= WB_GADGET_BACK_X &&
    x <  WB_GADGET_BACK_X + WB_GADGET_BACK_W &&
    y >= WB_GADGET_BACK_Y_REL &&
    y <  WB_GADGET_BACK_Y_REL + WB_GADGET_BACK_H
  );
}

function showHint(): void {
  if (!hintEl) return;
  // Snap to fully visible, then on the next frame restore the transition and
  // fade to 0 — this re-triggers the CSS opacity animation on every A→B.
  hintEl.style.transition = 'none';
  hintEl.style.opacity = '1';
  requestAnimationFrame(() => {
    if (!hintEl) return;
    hintEl.style.transition = '';
    hintEl.style.opacity = '0';
  });
}

function hideHint(): void {
  if (!hintEl) return;
  hintEl.style.transition = 'none';
  hintEl.style.opacity = '0';
}

export function setBoingForward(forward: boolean): void {
  if (forward === boingForward) return;
  boingForward = forward;
  if (wbImg) wbImg.style.display = forward ? 'none' : '';
  if (forward) showHint();
  else hideHint();
}

export function toggleBoingForward(): void {
  setBoingForward(!boingForward);
}

// CSS transform on the wrapper means the BCR is post-transform. Convert
// viewport-relative pointer coords back to wrapper-local CSS pixels by
// dividing out the current scale (rect.height / offsetHeight).
function localXY(wrapper: HTMLElement, e: PointerEvent): { x: number; y: number } {
  const rect = wrapper.getBoundingClientRect();
  const scale = rect.height / wrapper.offsetHeight;
  return {
    x: (e.clientX - rect.left) / scale,
    y: (e.clientY - rect.top)  / scale,
  };
}

export function initWorkbench(wrapper: HTMLElement): void {
  wbImg = document.getElementById('workbench') as HTMLImageElement;
  wbImg.src = workbenchUrl;
  applyPosition();
  hintEl = document.getElementById('hint') as HTMLDivElement | null;

  wrapper.addEventListener('pointerdown', (e: PointerEvent) => {
    const { x, y } = localXY(wrapper, e);

    if (boingForward) {
      if (inPhantom(x, y)) {
        pressedPhantom = true;
        wrapper.setPointerCapture(e.pointerId);
      }
      return;
    }

    // State A — gadget hit-test wins over the title-bar drag handle.
    if (inGadget(x, y)) {
      pressedGadget = true;
      wrapper.setPointerCapture(e.pointerId);
      return;
    }
    if (y >= splitY && y <= splitY + WB_TITLE_BAR_CSS) {
      dragging = true;
      dragOffset = y - splitY;
      wrapper.setPointerCapture(e.pointerId);
    }
  });

  wrapper.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    suppressNextClick = true;
    const { y } = localXY(wrapper, e);
    splitY = Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, y - dragOffset));
    applyPosition();
  });

  const end = (e: PointerEvent): void => {
    if (pressedGadget) {
      const { x, y } = localXY(wrapper, e);
      if (inGadget(x, y)) {
        setBoingForward(true);
        suppressNextClick = true;
      }
      pressedGadget = false;
    }
    if (pressedPhantom) {
      const { x, y } = localXY(wrapper, e);
      if (inPhantom(x, y)) {
        setBoingForward(false);
        suppressNextClick = true;
      }
      pressedPhantom = false;
    }
    dragging = false;
    if (wrapper.hasPointerCapture(e.pointerId)) {
      wrapper.releasePointerCapture(e.pointerId);
    }
  };
  wrapper.addEventListener('pointerup', end);
  wrapper.addEventListener('pointercancel', end);

  // The click event that follows a drag — or a resolved gadget/phantom
  // press — is suppressed so the window-level start/pause handler doesn't
  // fire. A bare click on the title bar (no movement) bubbles normally —
  // first click anywhere starts the demo and resumes audio; subsequent
  // clicks toggle pause.
  wrapper.addEventListener('click', (e: MouseEvent) => {
    if (suppressNextClick) {
      e.stopPropagation();
      suppressNextClick = false;
    }
  }, { capture: true });
}
