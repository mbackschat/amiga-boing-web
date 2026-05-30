// One physics step per video field — the demo's true update rate. The AMICUS
// loop advances once per frame, paced by the WaitTOF inside RethinkDisplay
// (ANIMATION-DETAILS.md §1), i.e. the field rate: 60 Hz NTSC / 50 Hz PAL. The
// original 1984 CES demo was NTSC, so 60 Hz is the authentic tempo (one step
// per frame on a 60 Hz display); bounce ≈ 1.6 s, traverse ≈ 3.1 s, stripe cycle
// ≈ 0.23 s. PAL would be 50 Hz, ~0.83× slower.
const PHYSICS_DT = 1 / 60;
const MAX_FRAME_DT = 0.2;

// Fixed-step physics with accumulator + variable-rate render. Decouples
// simulation from display refresh so palette cycling, motion, and impact
// timing stay consistent on 60 / 120 / 144Hz monitors.
export function startLoop(step: () => void, render: () => void): void {
  let lastTime = 0;
  let accumulator = 0;
  function frame(t: number): void {
    if (lastTime === 0) lastTime = t;
    const dt = Math.min((t - lastTime) / 1000, MAX_FRAME_DT);
    lastTime = t;
    accumulator += dt;
    while (accumulator >= PHYSICS_DT) {
      step();
      accumulator -= PHYSICS_DT;
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
