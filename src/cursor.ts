// Amiga Workbench 1.3 mouse pointer, traced from the cursor at (582, 250)
// of `specs/workbench/amiga1wb13.png`. 16×16 sprite, 4 palette indices:
//   0 = transparent
//   1 = red body
//   2 = light highlight
//   3 = black outline
// Drawn once into an offscreen sprite canvas; positioned by translating the
// on-DOM <canvas id="cursor"> via CSS left/top as the pointer moves.

const W = 16;
const H = 16;

// prettier-ignore
const PIXELS = new Uint8Array([
  1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 0, 0, 0, 0,
  1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 0, 0, 0, 0,
  1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 0, 0, 0, 0, 0, 0,
  1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 0, 0, 0, 0, 0, 0,
  1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 0, 0, 0, 0,
  1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 0, 0, 0, 0,
  1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 2, 2, 3, 3, 0, 0,
  1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 2, 2, 3, 3, 0, 0,
  3, 3, 3, 3, 0, 0, 3, 3, 1, 1, 1, 1, 2, 2, 3, 3,
  3, 3, 3, 3, 0, 0, 3, 3, 1, 1, 1, 1, 2, 2, 3, 3,
  0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 1, 1, 1, 1, 2, 2,
  0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 1, 1, 1, 1, 2, 2,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 1, 1, 1, 1,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 1, 1, 1, 1,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 1, 1,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 1, 1,
]);

// Same colors as the source PNG. `0` (transparent) is left fully transparent
// so the Workbench / Boing layer behind the cursor shows through.
const COLORS_RGBA: Uint32Array = new Uint32Array([
  0x00000000,                                      // transparent
  0xff << 24 | 0x20 << 16 | 0x20 << 8 | 0xdf,      // red body
  0xff << 24 | 0xcf << 16 | 0xb8 << 8 | 0xaf,      // light highlight
  0xff << 24 | 0x00 << 16 | 0x00 << 8 | 0x00,      // black outline
]);

function paintSprite(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(W, H);
  const out = new Uint32Array(imageData.data.buffer);
  for (let i = 0; i < PIXELS.length; i++) out[i] = COLORS_RGBA[PIXELS[i]];
  ctx.putImageData(imageData, 0, 0);
}

// Hot spot of the arrow — the pointer's "tip" pixel, top-left of the sprite.
const HOT_X = 0;
const HOT_Y = 0;

export function initCursor(wrapper: HTMLElement): void {
  const sprite = document.getElementById('cursor') as HTMLCanvasElement;
  sprite.width = W;
  sprite.height = H;
  paintSprite(sprite);
  sprite.style.display = 'none';

  // The sprite's native size is 16×16; CSS scales it 2× (matching the
  // hi-res Workbench layer) so the cursor reads as the same physical
  // size as on a real Amiga screen-stack.
  const CSS_SCALE = 2;

  wrapper.addEventListener('pointermove', (e: PointerEvent) => {
    // Divide out the wrapper's transform scale so the sprite (a child of the
    // wrapper) lands at the actual pointer in viewport coords.
    const rect = wrapper.getBoundingClientRect();
    const scale = rect.height / wrapper.offsetHeight;
    const x = (e.clientX - rect.left) / scale - HOT_X * CSS_SCALE;
    const y = (e.clientY - rect.top)  / scale - HOT_Y * CSS_SCALE;
    sprite.style.left = `${x}px`;
    sprite.style.top  = `${y}px`;
    sprite.style.display = 'block';
  });
  wrapper.addEventListener('pointerleave', () => {
    sprite.style.display = 'none';
  });
}
