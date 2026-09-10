import { Engine } from "@babylonjs/core/Engines/engine";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";

export type GamePhase = "ready" | "playing" | "gameover" | "won";

export type Level = 1 | 2 | 3;

export type GameSnapshot = {
  phase: GamePhase;
  level: Level;
  levelLabel: string;
  score: number;
  distance: number;
  altitude: number;
  progress: number;
  best: number;
};

export type GameHandle = {
  scene: Scene;
  dispose: () => void;
};

type Gate = {
  root: TransformNode;
  z: number;
  gapY: number;
  gapHeight: number;
  passed: boolean;
};

type Ribbon = { mesh: Mesh; speed: number };

const FINISH_DISTANCE = 320;
const START_Z = 28;
const GATE_SPACING = 27;
const GRAVITY = -7.2;
const FLAP_VELOCITY = 6.8;
/**
 * How much of the plane the gap has to clear. The mesh reaches 0.59 above and
 * 0.67 below its origin, so half a metre is the honest number here: it keeps
 * the hit box tied to what the player can see, which matters once the gaps
 * differ between levels — a fixed slack would quietly turn into a big fraction
 * of level 3's narrow gap.
 */
const PLANE_HALF_HEIGHT = 0.5;
const PLANE_START_Y = 4.35;
const PLANE_SCALE = 1.85;
// A paper dart glides slightly nose-down, and the chase camera sits almost level
// with it, so a standing trim plus a small bank keeps the wings facing the player
// instead of showing them edge-on.
const PITCH_TRIM = 0.2;
const PITCH_PER_SPEED = 0.052;
const PITCH_UP_LIMIT = -0.24;
const PITCH_DOWN_LIMIT = 0.3;
const CRASH_FLOOR = 0.55;
const YAW_TRIM = 0.18;
const ROLL_TRIM = 0.15;

type LevelConfig = {
  label: string;
  gapHeight: number;
  gapPattern: number[];
  flightSpeed: number;
  scoreMultiplier: number;
};

/**
 * Three hand-tuned courses rather than a difficulty curve, so a player can pick
 * the one that suits them and stay there. Each level widens or narrows the gap,
 * spreads the gaps further apart vertically, and changes how fast the corridor
 * arrives; the course length and gate spacing stay put so scores stay
 * comparable. `gapHeight` is the visible opening, and the hit box takes
 * `PLANE_HALF_HEIGHT` off each side of it — level 2 is set so that its usable
 * opening matches the single course this replaces.
 */
const LEVELS: Record<Level, LevelConfig> = {
  1: {
    label: "やさしい",
    gapHeight: 5,
    gapPattern: [5, 5.6, 5, 5.7, 5.2, 5.5, 5, 5.6, 5.2, 5.4, 5.1],
    flightSpeed: 14,
    scoreMultiplier: 1,
  },
  2: {
    label: "ふつう",
    gapHeight: 4.2,
    gapPattern: [4.8, 5.9, 4.5, 6.15, 5.1, 4.35, 5.75, 4.6, 6, 4.8, 5.45],
    flightSpeed: 16.5,
    scoreMultiplier: 1.5,
  },
  3: {
    label: "むずかしい",
    gapHeight: 3,
    gapPattern: [4.4, 3.5, 6.6, 3.6, 6.8, 4, 6.5, 3.4, 6.4, 3.8, 6],
    flightSpeed: 20.5,
    scoreMultiplier: 2,
  },
};

const LEVEL_KEYS: Level[] = [1, 2, 3];

/** What the level picker in the HUD renders, so the labels live in one place. */
export const LEVEL_OPTIONS = LEVEL_KEYS.map((level) => ({ level, label: LEVELS[level].label }));

function isLevel(value: number): value is Level {
  return value === 1 || value === 2 || value === 3;
}

function bestKey(level: Level) {
  return `paper-plane-best-l${level}`;
}

function readBest(level: Level) {
  const raw = Number(window.localStorage.getItem(bestKey(level)));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

function makeMaterial(scene: Scene, name: string, color: Color3, options?: { emissive?: Color3; alpha?: number }) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.specularColor = new Color3(0.1, 0.15, 0.18);
  material.roughness = 0.82;
  if (options?.emissive) material.emissiveColor = options.emissive;
  if (options?.alpha !== undefined) {
    material.alpha = options.alpha;
    material.transparencyMode = 2;
  }
  return material;
}

function addHazardBands(parent: TransformNode, scene: Scene, y: number, width: number, material: StandardMaterial) {
  for (let i = 0; i < 5; i += 1) {
    const band = MeshBuilder.CreateBox(`hazard-band-${i}`, { width: width * 0.26, height: 0.34, depth: 0.16 }, scene);
    band.position.set(-width * 0.39 + i * width * 0.2, y, -0.14);
    band.rotation.z = -0.46;
    band.material = material;
    band.parent = parent;
  }
}

function createCloud(scene: Scene, x: number, y: number, z: number, scale: number, material: StandardMaterial) {
  const root = new TransformNode(`cloud-${x}-${z}`, scene);
  const pieces = [
    [-1.15, 0, 0, 1.18],
    [0, 0.2, 0.15, 1.5],
    [1.15, 0, 0, 1.05],
    [0.25, -0.16, 0.55, 1.08],
  ];
  pieces.forEach(([px, py, pz, size], index) => {
    const puff = MeshBuilder.CreateSphere(`cloud-puff-${index}`, { diameter: size, segments: 14 }, scene);
    puff.position.set(px * scale, py * scale, pz * scale);
    puff.scaling.y = 0.63;
    puff.material = material;
    puff.parent = root;
  });
  root.position.set(x, y, z);
  return root;
}

function createMountain(scene: Scene, x: number, y: number, z: number, height: number, material: StandardMaterial) {
  const mountain = MeshBuilder.CreateCylinder(`mountain-${x}-${z}`, {
    height,
    diameterTop: 0.2,
    diameterBottom: height * 0.72,
    tessellation: 5,
  }, scene);
  mountain.position.set(x, y, z);
  mountain.rotation.y = (x + z) * 0.07;
  mountain.material = material;
  return mountain;
}

type Vec3 = [number, number, number];

function mirrorX(point: Vec3): Vec3 {
  return [-point[0], point[1], point[2]];
}

function mirrorFacet(facet: Vec3[]): Vec3[] {
  return facet.map(mirrorX).reverse();
}

function lift(point: Vec3, dy: number): Vec3 {
  return [point[0], point[1] + dy, point[2]];
}

function blend(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function createFacetMesh(name: string, scene: Scene, facets: Vec3[][], material: StandardMaterial) {
  const positions: number[] = [];
  const indices: number[] = [];
  facets.forEach((facet) => {
    const base = positions.length / 3;
    facet.forEach(([x, y, z]) => positions.push(x, y, z));
    for (let i = 1; i < facet.length - 1; i += 1) indices.push(base, base + i, base + i + 1);
  });
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.material = material;
  return mesh;
}

/**
 * Folded paper dart built from flat facets. The nose sits on +Z, so the model
 * points down the corridor the plane actually travels along.
 */
function createPaperPlane(scene: Scene, paper: StandardMaterial, fold: StandardMaterial, accent: StandardMaterial) {
  const nose: Vec3 = [0, 0, 1.16];
  const tail: Vec3 = [0, 0.05, -1.02];
  const tipL: Vec3 = [-0.94, 0.32, -0.9];
  const keel: Vec3 = [0, -0.36, -0.86];

  const root = new TransformNode("paper-plane", scene);
  root.scaling.setAll(PLANE_SCALE);

  const wingFacets: Vec3[][] = [[nose, tail, tipL]];
  const wings = createFacetMesh("paper-plane-wings", scene, [...wingFacets, ...wingFacets.map(mirrorFacet)], paper);
  wings.parent = root;

  // Centre keel: the fold you hold when you throw it, hanging below the wings.
  const keelMesh = createFacetMesh("paper-plane-keel", scene, [[nose, keel, tail]], fold);
  keelMesh.parent = root;

  // Inner folds and nose tip float a hair above the wing so the creases read at
  // a distance without z-fighting.
  const foldFacets: Vec3[][] = [[lift(nose, 0.02), lift(tail, 0.02), lift(blend(tipL, tail, 0.58), 0.02)]];
  const folds = createFacetMesh("paper-plane-folds", scene, [...foldFacets, ...foldFacets.map(mirrorFacet)], fold);
  folds.parent = root;

  const tipFacets: Vec3[][] = [[
    lift(nose, 0.026),
    lift(blend(nose, tail, 0.19), 0.026),
    lift(blend(nose, tipL, 0.21), 0.026),
  ]];
  const tips = createFacetMesh("paper-plane-tip", scene, [...tipFacets, ...tipFacets.map(mirrorFacet)], accent);
  tips.parent = root;

  return root;
}

function makeGate(scene: Scene, z: number, gapY: number, gapHeight: number, cream: StandardMaterial, coral: StandardMaterial): Gate {
  const root = new TransformNode(`gate-${z}`, scene);
  const gateWidth = 8.8;
  const corridorBottom = 0.45;
  const corridorTop = 11.7;
  const bottomHeight = Math.max(1.2, gapY - gapHeight / 2 - corridorBottom);
  const topHeight = Math.max(1.2, corridorTop - (gapY + gapHeight / 2));

  const bottom = MeshBuilder.CreateBox(`gate-bottom-${z}`, { width: gateWidth, height: bottomHeight, depth: 2.1 }, scene);
  bottom.position.set(0, corridorBottom + bottomHeight / 2, 0);
  bottom.material = cream;
  bottom.parent = root;
  addHazardBands(root, scene, corridorBottom + 0.55, gateWidth, coral);

  const top = MeshBuilder.CreateBox(`gate-top-${z}`, { width: gateWidth, height: topHeight, depth: 2.1 }, scene);
  top.position.set(0, corridorTop - topHeight / 2, 0);
  top.material = cream;
  top.parent = root;
  addHazardBands(root, scene, corridorTop - 0.55, gateWidth, coral);

  const marker = MeshBuilder.CreateBox(`gate-marker-${z}`, { width: 0.17, height: 1.25, depth: 0.2 }, scene);
  marker.position.set(-gateWidth * 0.44, gapY, -1.12);
  marker.material = coral;
  marker.parent = root;

  root.position.z = z;
  return { root, z, gapY, gapHeight, passed: false };
}

function publish(snapshot: GameSnapshot) {
  window.dispatchEvent(new CustomEvent<GameSnapshot>("paper-plane-snapshot", { detail: snapshot }));
}

export async function createGameScene(engine: Engine, canvas: HTMLCanvasElement): Promise<GameHandle> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.025, 0.54, 0.73, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(0.025, 0.54, 0.73);
  scene.fogDensity = 0.0028;
  scene.imageProcessingConfiguration.contrast = 1.08;
  scene.imageProcessingConfiguration.exposure = 1.05;

  const camera = new FreeCamera("flight-camera", new Vector3(0, 5.1, -14), scene);
  camera.fov = 0.78;
  camera.minZ = 0.1;
  camera.maxZ = 500;
  camera.setTarget(new Vector3(0, 4.25, 28));

  const sun = new DirectionalLight("sun", new Vector3(-0.32, -0.7, 0.45), scene);
  sun.intensity = 1.35;
  sun.diffuse = new Color3(1, 0.93, 0.78);
  sun.specular = new Color3(0.32, 0.4, 0.5);
  const fill = new HemisphericLight("sky-fill", new Vector3(0, 1, 0), scene);
  fill.intensity = 0.7;
  fill.diffuse = new Color3(0.35, 0.82, 1);
  fill.groundColor = new Color3(0.04, 0.22, 0.34);

  const waterMaterial = makeMaterial(scene, "lagoon", new Color3(0.015, 0.64, 0.78), { emissive: new Color3(0.01, 0.16, 0.2), alpha: 0.92 });
  const creamMaterial = makeMaterial(scene, "warm-concrete", new Color3(0.84, 0.8, 0.68));
  const coralMaterial = makeMaterial(scene, "warning-coral", new Color3(0.94, 0.25, 0.12), { emissive: new Color3(0.18, 0.025, 0.01) });
  const cloudMaterial = makeMaterial(scene, "cloud-white", new Color3(0.93, 0.98, 0.98));
  const mountainMaterial = makeMaterial(scene, "island-blue", new Color3(0.03, 0.38, 0.57), { emissive: new Color3(0.01, 0.08, 0.11) });
  const mountainLightMaterial = makeMaterial(scene, "island-light", new Color3(0.16, 0.64, 0.63));
  const beaconMaterial = makeMaterial(scene, "finish-beacon", new Color3(0.95, 0.92, 0.74), { emissive: new Color3(0.95, 0.42, 0.08) });
  const cyanMaterial = makeMaterial(scene, "finish-cyan", new Color3(0.24, 0.95, 1), { emissive: new Color3(0.04, 0.35, 0.4) });
  const paperMaterial = makeMaterial(scene, "paper-white", new Color3(0.97, 0.98, 1), { emissive: new Color3(0.3, 0.34, 0.4) });
  const paperFoldMaterial = makeMaterial(scene, "paper-fold", new Color3(0.11, 0.46, 0.86), { emissive: new Color3(0.03, 0.12, 0.24) });
  const paperTipMaterial = makeMaterial(scene, "paper-tip", new Color3(0.95, 0.31, 0.22), { emissive: new Color3(0.2, 0.05, 0.03) });
  [paperMaterial, paperFoldMaterial, paperTipMaterial].forEach((material) => {
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
  });

  const water = MeshBuilder.CreateGround("endless-water", { width: 240, height: 480 }, scene);
  water.position.y = 0;
  water.material = waterMaterial;

  const horizon = MeshBuilder.CreateBox("horizon-strip", { width: 240, height: 0.7, depth: 0.6 }, scene);
  horizon.position.set(0, 1.1, 125);
  horizon.material = cyanMaterial;

  const ribbons: Ribbon[] = [];
  for (let i = 0; i < 18; i += 1) {
    const ribbon = MeshBuilder.CreateBox(`speed-ribbon-${i}`, { width: 0.08 + (i % 3) * 0.05, height: 0.045, depth: 5 + (i % 4) * 2 }, scene);
    ribbon.position.set((i % 2 === 0 ? -1 : 1) * (1.5 + (i * 1.43) % 10), 0.14 + (i % 4) * 0.04, 12 + (i * 19) % 135);
    ribbon.material = cyanMaterial;
    ribbons.push({ mesh: ribbon, speed: 0.8 + (i % 4) * 0.16 });
  }

  for (let i = 0; i < 7; i += 1) {
    const x = i % 2 === 0 ? -25 - i * 3.5 : 25 + i * 3.2;
    createMountain(scene, x, 3.7, 58 + i * 18, 9 + (i % 3) * 4, mountainMaterial);
    createMountain(scene, x * 0.85, 3.8, 63 + i * 18, 5 + (i % 2) * 2, mountainLightMaterial);
  }
  createCloud(scene, -22, 11.7, 50, 1.7, cloudMaterial);
  createCloud(scene, 22, 10.6, 77, 1.35, cloudMaterial);
  createCloud(scene, -28, 13.2, 116, 2.1, cloudMaterial);
  createCloud(scene, 27, 12.1, 145, 1.6, cloudMaterial);

  const plane = createPaperPlane(scene, paperMaterial, paperFoldMaterial, paperTipMaterial);
  plane.position.set(0, PLANE_START_Y, 0.65);
  plane.rotation.set(PITCH_TRIM, YAW_TRIM, ROLL_TRIM);

  const planeShadow = MeshBuilder.CreateDisc("plane-shadow", { radius: 1.15, tessellation: 24 }, scene);
  planeShadow.rotation.x = Math.PI / 2;
  planeShadow.position.set(0, 0.22, 0.65);
  const shadowMaterial = makeMaterial(scene, "plane-shadow-mat", new Color3(0.02, 0.18, 0.24), { alpha: 0.3 });
  planeShadow.material = shadowMaterial;

  const updateShadow = () => {
    // Higher plane, smaller and fainter shadow on the water below it.
    const lift = Math.min(1, Math.max(0, (plane.position.y - 0.9) / 9.5));
    const spread = 1 - lift * 0.45;
    planeShadow.scaling.x = spread;
    planeShadow.scaling.y = spread;
    shadowMaterial.alpha = 0.3 - lift * 0.21;
  };

  const query = new URLSearchParams(window.location.search);
  const demo = query.has("demo");
  const requestedLevel = Number(query.get("level"));
  const storedLevel = Number(window.localStorage.getItem("paper-plane-level"));
  let level: Level = isLevel(requestedLevel)
    ? requestedLevel
    : demo || !isLevel(storedLevel)
      ? 1
      : storedLevel;
  let config = LEVELS[level];
  let flightSpeed = config.flightSpeed;

  let gates: Gate[] = [];
  const buildGates = () => {
    gates.forEach((gate) => gate.root.dispose());
    gates = config.gapPattern.map((gapY, index) =>
      makeGate(scene, START_Z + index * GATE_SPACING, gapY, config.gapHeight, creamMaterial, coralMaterial));
  };

  const portalRoot = new TransformNode("finish-portal", scene);
  portalRoot.position.set(0, 4.5, 335);
  const portalLeft = MeshBuilder.CreateBox("portal-left", { width: 0.55, height: 7.4, depth: 0.75 }, scene);
  portalLeft.position.x = -5.1;
  portalLeft.material = cyanMaterial;
  portalLeft.parent = portalRoot;
  const portalRight = portalLeft.clone("portal-right");
  portalRight.position.x = 5.1;
  portalRight.parent = portalRoot;
  const portalTop = MeshBuilder.CreateBox("portal-top", { width: 10.75, height: 0.55, depth: 0.75 }, scene);
  portalTop.position.y = 3.45;
  portalTop.material = cyanMaterial;
  portalTop.parent = portalRoot;
  for (let i = 0; i < 8; i += 1) {
    const check = MeshBuilder.CreateBox(`finish-check-${i}`, { width: 0.9, height: 0.65, depth: 0.8 }, scene);
    check.position.set(-3.6 + i * 1.03, 2.5, -0.05);
    check.material = i % 2 === 0 ? beaconMaterial : creamMaterial;
    check.parent = portalRoot;
  }

  let phase: GamePhase = "ready";
  let velocityY = 0;
  let elapsed = 0;
  let distance = 0;
  let score = 0;
  let best = readBest(level);
  let flapCooldown = 0;
  let disposed = false;
  let hudTimer = 0;
  let hudPhase: GamePhase | null = null;

  // The HUD is DOM, so every publish costs a React render. Fifteen updates a
  // second is plenty for a score readout and keeps the render loop free on
  // tablets; a phase change always goes out immediately.
  const HUD_INTERVAL = 1 / 15;

  const snapshot = (): GameSnapshot => ({
    phase,
    level,
    levelLabel: config.label,
    score,
    distance,
    altitude: plane.position.y,
    progress: Math.min(1, distance / FINISH_DISTANCE),
    best,
  });

  const publishNow = () => {
    hudTimer = 0;
    hudPhase = phase;
    publish(snapshot());
  };

  const endRun = (bonus = 0) => {
    score += Math.round(bonus * config.scoreMultiplier);
    best = Math.max(best, score);
    window.localStorage.setItem(bestKey(level), String(best));
  };

  const reset = () => {
    phase = "ready";
    velocityY = 0;
    elapsed = 0;
    distance = 0;
    score = 0;
    plane.position.set(0, PLANE_START_Y, 0.65);
    plane.rotation.set(PITCH_TRIM, YAW_TRIM, ROLL_TRIM);
    updateShadow();
    portalRoot.position.z = 335;
    gates.forEach((gate, index) => {
      gate.root.position.z = START_Z + index * GATE_SPACING;
      gate.passed = false;
    });
    publishNow();
  };

  const setLevel = (next: Level) => {
    if (next === level) return;
    level = next;
    config = LEVELS[level];
    flightSpeed = config.flightSpeed;
    best = readBest(level);
    window.localStorage.setItem("paper-plane-level", String(level));
    buildGates();
    reset();
  };

  const rise = () => {
    if (disposed) return;
    if (phase === "gameover" || phase === "won") {
      reset();
      phase = "playing";
    } else if (phase === "ready") {
      phase = "playing";
    }
    velocityY = Math.min(FLAP_VELOCITY, velocityY + 4.6);
    flapCooldown = 0.28;
    publishNow();
  };

  const onPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    rise();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Space" || event.code === "ArrowUp") {
      event.preventDefault();
      rise();
    }
    if (event.code === "KeyR" && (phase === "gameover" || phase === "won")) {
      reset();
    }
  };
  const onAction = (event: Event) => {
    const action = (event as CustomEvent<string>).detail;
    if (action === "rise") rise();
    if (action === "restart") reset();
    const picked = action.startsWith("level:") ? Number(action.slice(6)) : NaN;
    if (isLevel(picked)) setLevel(picked);
  };
  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("paper-plane-action", onAction);

  buildGates();
  reset();

  const update = () => {
    if (disposed) return;
    const dt = Math.min(0.04, engine.getDeltaTime() / 1000);
    elapsed += dt;
    flapCooldown = Math.max(0, flapCooldown - dt);

    if (demo && phase === "ready") rise();

    if (phase === "playing") {
      if (demo && flapCooldown <= 0) {
        const nextGate = gates.filter((gate) => gate.root.position.z > 1.5).sort((a, b) => a.root.position.z - b.root.position.z)[0];
        if (nextGate) {
          const targetY = nextGate.gapY;
          if (plane.position.y < targetY - 0.35) rise();
          else if (plane.position.y > targetY + 0.95) velocityY -= 1.1 * dt;
        }
      }

      velocityY += GRAVITY * dt;
      plane.position.y += velocityY * dt;
      // Negative rotation.x lifts the nose in Babylon's left-handed frame, so the
      // model always points along the path it is actually travelling.
      plane.rotation.x = PITCH_TRIM + Math.max(PITCH_UP_LIMIT, Math.min(PITCH_DOWN_LIMIT, -velocityY * PITCH_PER_SPEED));
      plane.rotation.y = YAW_TRIM + Math.sin(elapsed * 0.8) * 0.05;
      plane.rotation.z = ROLL_TRIM + Math.sin(elapsed * 1.5) * 0.07;
      updateShadow();
      distance += flightSpeed * dt;
      score = Math.floor(distance * 12.5 * config.scoreMultiplier);

      gates.forEach((gate) => {
        gate.root.position.z -= flightSpeed * dt;
        if (!gate.passed && gate.root.position.z < -1.3) {
          gate.passed = true;
          score += Math.round(150 * config.scoreMultiplier);
        }
        if (gate.root.position.z < -22) {
          gate.root.position.z += gates.length * GATE_SPACING;
          gate.passed = false;
        }
        const inGate = gate.root.position.z > -1.25 && gate.root.position.z < 1.25;
        const withinGap = Math.abs(plane.position.y - gate.gapY) < gate.gapHeight / 2 - PLANE_HALF_HEIGHT;
        if (inGate && !withinGap) {
          phase = "gameover";
          endRun();
        }
      });

      if (plane.position.y < 0.92 || plane.position.y > 11.25) {
        phase = "gameover";
        endRun();
      }

      portalRoot.position.z -= flightSpeed * dt;
      portalRoot.rotation.y = Math.sin(elapsed * 1.7) * 0.035;
      if (distance >= FINISH_DISTANCE || portalRoot.position.z < 1.6) {
        phase = "won";
        endRun(500);
      }
      camera.position.y += (5.1 + (plane.position.y - PLANE_START_Y) * 0.22 - camera.position.y) * Math.min(1, dt * 4);
      camera.setTarget(new Vector3(0, 4.05 + (plane.position.y - PLANE_START_Y) * 0.1, 28));
    }

    if (phase === "gameover" && plane.position.y > CRASH_FLOOR) {
      // Tumble down to the water instead of hanging where the run ended.
      velocityY += GRAVITY * 1.5 * dt;
      plane.position.y = Math.max(CRASH_FLOOR, plane.position.y + velocityY * dt);
      plane.rotation.x += dt * 2.6;
      plane.rotation.z += dt * 1.9;
      updateShadow();
    }

    ribbons.forEach(({ mesh, speed }) => {
      mesh.position.z -= flightSpeed * dt * speed;
      if (mesh.position.z < -18) mesh.position.z += 168;
    });

    hudTimer += dt;
    if (phase !== hudPhase || hudTimer >= HUD_INTERVAL) publishNow();
  };

  const observer = scene.onBeforeRenderObservable.add(update);

  return {
    scene,
    dispose: () => {
      disposed = true;
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paper-plane-action", onAction);
      scene.onBeforeRenderObservable.remove(observer);
      scene.dispose();
    },
  };
}
