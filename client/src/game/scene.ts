import { Engine } from "@babylonjs/core/Engines/engine";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";

export type GamePhase = "ready" | "playing" | "gameover" | "won";

export type GameSnapshot = {
  phase: GamePhase;
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

const PLAYER_TEXTURE = "/paper-plane-cutout.png";
const FINISH_DISTANCE = 320;
const START_Z = 28;
const GATE_SPACING = 27;
const GATE_COUNT = 11;
const GRAVITY = -7.2;
const FLAP_VELOCITY = 6.8;
const FLIGHT_SPEED = 16.5;
const PLANE_RADIUS = 0.78;

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

function makeGate(scene: Scene, z: number, gapY: number, cream: StandardMaterial, coral: StandardMaterial): Gate {
  const root = new TransformNode(`gate-${z}`, scene);
  const gateWidth = 8.8;
  const corridorBottom = 0.45;
  const corridorTop = 11.7;
  const gapHeight = 3.7;
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

  const plane = MeshBuilder.CreatePlane("paper-plane", { width: 4.35, height: 3.2, sideOrientation: Mesh.DOUBLESIDE }, scene);
  plane.position.set(0, 4.35, 0.65);
  plane.rotation.x = -0.13;
  const planeMaterial = new StandardMaterial("paper-plane-art", scene);
  const planeTexture = new Texture(PLAYER_TEXTURE, scene, true, false);
  planeTexture.hasAlpha = true;
  planeMaterial.diffuseTexture = planeTexture;
  planeMaterial.useAlphaFromDiffuseTexture = true;
  planeMaterial.backFaceCulling = false;
  planeMaterial.emissiveColor = new Color3(0.12, 0.18, 0.25);
  plane.material = planeMaterial;

  const planeShadow = MeshBuilder.CreateDisc("plane-shadow", { radius: 0.85, tessellation: 24 }, scene);
  planeShadow.rotation.x = Math.PI / 2;
  planeShadow.position.set(0, 0.22, 0.65);
  const shadowMaterial = makeMaterial(scene, "plane-shadow-mat", new Color3(0.02, 0.18, 0.24), { alpha: 0.26 });
  planeShadow.material = shadowMaterial;

  const gates: Gate[] = [];
  const gapPattern = [4.8, 5.9, 4.5, 6.15, 5.1, 4.35, 5.75, 4.6, 6.0, 4.8, 5.45];
  for (let i = 0; i < GATE_COUNT; i += 1) {
    gates.push(makeGate(scene, START_Z + i * GATE_SPACING, gapPattern[i], creamMaterial, coralMaterial));
  }

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

  const demo = new URLSearchParams(window.location.search).has("demo");
  let phase: GamePhase = "ready";
  let velocityY = 0;
  let elapsed = 0;
  let distance = 0;
  let score = 0;
  let best = Number(window.localStorage.getItem("paper-plane-best") || 0);
  let flapCooldown = 0;
  let disposed = false;

  const snapshot = (): GameSnapshot => ({
    phase,
    score,
    distance,
    altitude: plane.position.y,
    progress: Math.min(1, distance / FINISH_DISTANCE),
    best,
  });

  const reset = () => {
    phase = "ready";
    velocityY = 0;
    elapsed = 0;
    distance = 0;
    score = 0;
    plane.position.set(0, 4.35, 0.65);
    plane.rotation.x = -0.13;
    portalRoot.position.z = 335;
    gates.forEach((gate, index) => {
      gate.root.position.z = START_Z + index * GATE_SPACING;
      gate.passed = false;
    });
    publish(snapshot());
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
    publish(snapshot());
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
  };
  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("paper-plane-action", onAction);

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
      plane.rotation.x = -0.13 + Math.max(-0.24, Math.min(0.26, velocityY * 0.028));
      planeShadow.scaling.x = 1 + (plane.position.y - 1.2) * 0.04;
      planeShadow.scaling.y = 1 + (plane.position.y - 1.2) * 0.04;
      distance += FLIGHT_SPEED * dt;
      score = Math.floor(distance * 12.5);

      gates.forEach((gate) => {
        gate.root.position.z -= FLIGHT_SPEED * dt;
        if (!gate.passed && gate.root.position.z < -1.3) {
          gate.passed = true;
          score += 150;
        }
        if (gate.root.position.z < -22) {
          gate.root.position.z += GATE_COUNT * GATE_SPACING;
          gate.passed = false;
        }
        const inGate = gate.root.position.z > -1.25 && gate.root.position.z < 1.25;
        const withinGap = Math.abs(plane.position.y - gate.gapY) < gate.gapHeight / 2 - PLANE_RADIUS * 0.32;
        if (inGate && !withinGap) {
          phase = "gameover";
          best = Math.max(best, score);
          window.localStorage.setItem("paper-plane-best", String(best));
        }
      });

      if (plane.position.y < 0.92 || plane.position.y > 11.25) {
        phase = "gameover";
        best = Math.max(best, score);
        window.localStorage.setItem("paper-plane-best", String(best));
      }

      portalRoot.position.z -= FLIGHT_SPEED * dt;
      portalRoot.rotation.y = Math.sin(elapsed * 1.7) * 0.035;
      if (distance >= FINISH_DISTANCE || portalRoot.position.z < 1.6) {
        phase = "won";
        best = Math.max(best, score + 500);
        score += 500;
        window.localStorage.setItem("paper-plane-best", String(best));
      }
      camera.position.y += (5.1 + (plane.position.y - 4.35) * 0.22 - camera.position.y) * Math.min(1, dt * 4);
      camera.setTarget(new Vector3(0, 4.05 + (plane.position.y - 4.35) * 0.1, 28));
    }

    ribbons.forEach(({ mesh, speed }) => {
      mesh.position.z -= FLIGHT_SPEED * dt * speed;
      if (mesh.position.z < -18) mesh.position.z += 168;
    });

    publish(snapshot());
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
