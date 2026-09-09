# Game Plan: Paper Plane Flight

## Risk Tasks

### 1. Continuous flight and tap-driven vertical control
- **Why isolated:** The plane must combine automatic forward motion, gravity, tap impulses, and restart/win/game-over state transitions without feeling unresponsive.
- **Approach:** Keep the plane near the camera while gates move toward it. Apply a capped vertical velocity with gravity and a short flap impulse on semantic `rise` input. Drive all state changes from the scene update loop and emit a compact DOM snapshot for the HUD.
- **Verify:** Pointer/tap and Space both raise the plane immediately; releasing input returns it to a falling arc; ready → playing → game over/win and replay transitions are visible and stable.

### 2. Procedural gate layout and collision windows
- **Why isolated:** Repeated 3D gates must look varied, preserve a readable opening, and collide only with the closed wall segments.
- **Approach:** Use a seeded alternating gate pattern with a moving gap center and fixed corridor bounds. Each gate owns its top/bottom meshes and decorative warning stripes; collision tests the plane against the gate's z slab and gap rectangle.
- **Verify:** Gates approach continuously, gaps are visually obvious, plane can pass through an opening, and contact with a wall triggers an immediate failure without false positives in the opening.

## Main Build

A full-screen Babylon.js browser game with a chase-camera 3D-style sky corridor. The plane flies automatically; taps/Space make it rise. Alternating cream walls with coral hazard stripes create gates, with cyan water, stylized clouds, and mountains providing depth. A responsive DOM HUD shows score, distance, altitude, best score, and contextual controls. `?demo` runs a deterministic autopilot for visual verification.

- **Assets:**
  - Generated paper airplane cutout (`/manus-storage/paper-plane-cutout_58740b21.png`) — use as the in-game player texture and HUD icon.
  - Generated visual reference (`/manus-storage/paper-plane-reference_1e0d3f8b.png`) — recorded as art direction anchor; runtime scene is built from procedural meshes to keep the game lightweight.
- **Verify:**
  - Input response, falling trajectory, camera framing, collision, score progression, goal portal, win, and replay.
  - HUD readable on desktop and narrow/mobile viewports with no overlap.
  - No missing textures, browser console errors, or visible placeholder art.
  - Reference consistency: cyan/cream/coral/navy palette, forward corridor camera, clean game-engine rendering.
  - `pnpm check` and `pnpm build` pass; WebDev screenshots show ready, active, and game-over/win states.
