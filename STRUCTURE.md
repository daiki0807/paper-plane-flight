# Structure

## Runtime ownership

- `client/src/components/GameCanvas.tsx` owns the React/Babylon lifecycle, canvas, and DOM HUD overlay.
- `client/src/game/scene.ts` owns the Babylon scene, input listeners, game state, camera, lighting, materials, and the update loop.
- The player plane, gate meshes, clouds, mountains, water ribbons, and finish portal are scene-owned Babylon nodes and are disposed with the scene.
- HUD state crosses the framework boundary through the `paper-plane-snapshot` CustomEvent; gameplay never imports React.

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

- `?demo` enables deterministic start and autopilot flap timing.
- `paper-plane-snapshot` events expose `ready`, `playing`, `gameover`, and `won` plus score, distance, best, altitude, and progress.
