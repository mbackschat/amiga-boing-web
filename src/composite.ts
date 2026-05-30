import { palette } from './palette.ts';

// Per-pixel composite walk implementing the 5th-bitplane palette-half-toggle
// rule from docs/IMPLEMENTATION.md §1.
//
//   ballIdx=0 → sky (0) or magenta wireframe (16)
//   ballIdx=1 → grey rim (1) or dark-magenta rim (17)
//   ballIdx>1 → ball facet; identical colors at slot N and N+16 every frame.

export function composite(
  ballBuf: Uint8Array,
  ballBufW: number,
  ballBufH: number,
  bgBuf: Uint8Array,
  ballOffX: number,
  ballOffY: number,
  imageData: ImageData,
  w: number,
  h: number,
): void {
  const out = new Uint32Array(imageData.data.buffer);
  for (let y = 0; y < h; y++) {
    const by = y + ballOffY;
    const bgRow = y * w;
    for (let x = 0; x < w; x++) {
      const bx = x + ballOffX;
      let ballIdx = 0;
      if (bx >= 0 && bx < ballBufW && by >= 0 && by < ballBufH) {
        ballIdx = ballBuf[by * ballBufW + bx];
      }
      const bgBit = bgBuf[bgRow + x];
      let finalIdx: number;
      if (ballIdx === 0)      finalIdx = bgBit ? 16 : 0;
      else if (ballIdx === 1) finalIdx = bgBit ? 17 : 1;
      else                    finalIdx = bgBit ? ballIdx + 16 : ballIdx;
      out[bgRow + x] = palette[finalIdx];
    }
  }
}
