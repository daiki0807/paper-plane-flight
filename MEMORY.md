# Memory

- WebDev scaffold is a React 19 + Vite + Tailwind static project at `/home/ubuntu/paper-plane-flight`.
- `@babylonjs/core` 9.25.0 is installed; no loaders are needed because the player asset is a PNG texture.
- Generated assets are intentionally kept outside the project and uploaded to WebDev storage to avoid deploy-timeout issues.
- Game uses procedural meshes for the corridor so it remains fast on touch devices and still has depth from perspective, lighting, fog, and parallax props.
- Browser audio is not included because it is not part of the request and needs a user gesture to unlock.
