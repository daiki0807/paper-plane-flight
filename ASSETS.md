# Assets

**Art direction:** Bright cyan sky corridor with a cream concrete and coral hazard-stripe gate system, deep navy interface cards, white folded paper airplane with blue edge highlights, clean sharp 3D game-engine rendering, optimistic arcade-flight mood.

## 3D Models

| Name | Description | Size | Image | GLB |
|------|-------------|------|-------|-----|
| player_plane | Procedural folded paper dart, nose on +Z, built from flat facets in `createPaperPlane` | 3.5m span | — | — |

## Textures

| Name | Description | Size | Image |
|------|-------------|------|-------|
| plane_cutout | Generated white folded paper plane with blue and coral accents. No longer used in-game (the player is a real mesh); kept as the art-direction reference for the model's palette. | — | `client/public/paper-plane-cutout.png` |

## Backgrounds

| Name | Description | Size | Image |
|------|-------------|------|-------|
| visual_reference | Generated gameplay reference used as art-direction anchor | 2560x1440, 16:9 | `/manus-storage/paper-plane-reference_1e0d3f8b.png` |

## Procedural scene assets

- Cream gate boxes and coral hazard stripes: Babylon boxes, varied gap height and x-position.
- Cyan flight surface and speed ribbons: Babylon planes and thin boxes.
- White cloud clusters and faceted island mountains: Babylon spheres/cones.
- Finish portal and checkered beacon: Babylon boxes and emissive materials.
