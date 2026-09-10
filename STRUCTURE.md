# Structure

## Runtime ownership

- `client/src/components/GameCanvas.tsx` owns the React/Babylon lifecycle, canvas, and DOM HUD overlay.
- `client/src/game/scene.ts` owns the Babylon scene, input listeners, game state, camera, lighting, materials, and the update loop.
- The player plane, gate meshes, clouds, mountains, water ribbons, and finish portal are scene-owned Babylon nodes and are disposed with the scene.
- HUD state crosses the framework boundary through the `paper-plane-snapshot` CustomEvent; gameplay never imports React.

## Levels

- `LEVELS` in `client/src/game/scene.ts` holds three hand-tuned courses. Each sets the visible `gapHeight`, the `gapPattern` of gap centres, the corridor `flightSpeed`, and a `scoreMultiplier`; course length and gate spacing are shared so scores stay comparable.
- The hit box takes `PLANE_HALF_HEIGHT` off each side of `gapHeight`, so the usable opening tracks what the player sees. Level 2 is set so its usable opening (±1.60m) matches the single course that preceded the levels.
- Switching level disposes and rebuilds the gate meshes (`buildGates`) because the gap height is baked into their geometry, then resets the run.
- The chosen level and a per-level best score persist in `localStorage` (`paper-plane-level`, `paper-plane-best-l<n>`).

## Coordinate system

- Forward flight is positive Z; the player is held near Z=0 and gates move toward negative Z.
- The player model is authored nose-first on +Z, so `rotation` alone aims it along the direction of travel: negative `rotation.x` lifts the nose, and a standing pitch/yaw/roll trim keeps the wings visible from the chase camera.
- X is lateral lane position; Y is altitude.
- The camera sits behind and slightly above the plane, looking down the corridor.

## Asset hints

- Player is a procedural folded dart (`createPaperPlane`): white wing facets, a blue centre keel and inner folds, and a coral nose, all built from flat triangles via `VertexData`.
- All repeated obstacles and environment props are procedural Babylon meshes with a coherent cream/coral/cyan material palette.
- UI uses generated player art as a small brand mark and uses CSS for crisp text, bars, and status cards.

## Verification hooks

- `?demo` enables deterministic start and autopilot flap timing, and pins the run to level 1 so it does not inherit whichever level was stored last. The level-1 autopilot completes a full 320m run.
- `?level=1|2|3` opens a specific course, which is how the harder ones get checked without replaying the easy one.
- `paper-plane-snapshot` events expose `ready`, `playing`, `gameover`, and `won` plus score, distance, best, altitude, progress, and the active level with its label.
- `paper-plane-action` accepts `rise`, `restart`, and `level:1|2|3`.
