#!/usr/bin/env python3
"""
Retouch amiga1wb13.png to remove the Amiga mouse cursor.

The cursor sits at (582, 250)..(597, 265) in the original screenshot, over
the Workbench desktop blue. Paint over its non-blue pixels with the
surrounding background blue. Output goes to src/workbench.png so Vite's
?url import inlines it into the bundle.

Run once before the implementation lands; the result is committed.
"""
from PIL import Image
import pathlib

ROOT = pathlib.Path(__file__).parent.parent.parent
SRC  = ROOT / "specs" / "workbench" / "amiga1wb13.png"
DST  = ROOT / "src"   / "workbench.png"

CURSOR_BOX = (582, 250, 597, 265)  # inclusive
BG_BLUE    = (0, 87, 175)          # the Workbench desktop blue

def retouch():
    im = Image.open(SRC).convert("RGB")
    px = im.load()
    x0, y0, x1, y1 = CURSOR_BOX
    repainted = 0
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            r, g, b = px[x, y]
            # Only paint over cursor colors (red / light highlight / black outline).
            # Leaves the background-blue pixels of the box alone.
            if (r, g, b) != BG_BLUE:
                px[x, y] = BG_BLUE
                repainted += 1
    # De-interlace: the source image is PAL hi-res interlaced (640×512) where
    # every two rows are identical (verified). Drop the duplicates → 640×256.
    # Keep the full 256-row height so the image fills the 1280×920 demo wrapper
    # vertically (CSS-scaled 2× horizontal / 4× vertical = 1280×1024 CSS; the
    # bottom 104 CSS px clip past the wrapper but the visible region always
    # shows real Workbench content, never the sky background).
    W, H = im.size
    deinterlaced = im.resize((W, H // 2), Image.NEAREST)
    DST.parent.mkdir(parents=True, exist_ok=True)
    deinterlaced.save(DST)
    print(f"Retouched {repainted} pixels in {CURSOR_BOX}; de-interlaced to {deinterlaced.size}; wrote {DST}")

if __name__ == "__main__":
    retouch()
