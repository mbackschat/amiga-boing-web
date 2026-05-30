// 32-entry palette. ImageData is RGBA in memory; on little-endian a packed
// uint32 reads as 0xAABBGGRR. Helpers below produce that form from #RRGGBB.

function rgb(r: number, g: number, b: number): number {
  return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export const SKY          = rgb(0xaa, 0xaa, 0xaa); // #AAAAAA
export const RIM          = rgb(0x66, 0x66, 0x66); // #666666
export const MAGENTA      = rgb(0xaa, 0x00, 0xaa); // #AA00AA (sky over wireframe)
export const DARK_MAGENTA = rgb(0x66, 0x00, 0x66); // #660066 (rim over wireframe)
export const WHITE        = rgb(0xff, 0xff, 0xff);
export const RED          = rgb(0xff, 0x00, 0x00);
export const PINK         = rgb(0xff, 0xdd, 0xdd);

export const palette = new Uint32Array(32);

export function initPalette(): void {
  palette[0]  = SKY;
  palette[1]  = RIM;
  palette[16] = MAGENTA;
  palette[17] = DARK_MAGENTA;
  stepPalette(0, 1);
}

// Per-frame palette rotation. rotPhase ∈ 0..13; vxSign is the sign of horizontal
// velocity (+1 or -1) and decides which side of the sphere holds the highlight.
// See docs/IMPLEMENTATION.md §2.
export function stepPalette(rotPhase: number, vxSign: number): void {
  for (let i = 0; i < 7; i++) {
    const slot = ((i + rotPhase) % 14) + 2;
    palette[slot] = palette[slot + 16] = WHITE;
  }
  for (let i = 7; i < 14; i++) {
    const slot = ((i + rotPhase) % 14) + 2;
    palette[slot] = palette[slot + 16] = RED;
  }
  const highlightSlot = ((vxSign >= 0 ? 0 : 6) + rotPhase) % 14 + 2;
  palette[highlightSlot] = palette[highlightSlot + 16] = PINK;
}
