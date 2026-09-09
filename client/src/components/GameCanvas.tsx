import { useEffect, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createGameScene, type GameHandle, type GameSnapshot } from "@/game/scene";

const initialSnapshot: GameSnapshot = {
  phase: "ready",
  score: 0,
  distance: 0,
  altitude: 4.35,
  progress: 0,
  best: 0,
};

function formatScore(value: number) {
  return value.toLocaleString("en-US").padStart(5, "0");
}

function dispatchAction(action: "rise" | "restart") {
  window.dispatchEvent(new CustomEvent("paper-plane-action", { detail: action }));
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  const [snapshot, setSnapshot] = useState<GameSnapshot>(initialSnapshot);

  useEffect(() => {
    const onSnapshot = (event: Event) => setSnapshot((event as CustomEvent<GameSnapshot>).detail);
    window.addEventListener("paper-plane-snapshot", onSnapshot);
    return () => window.removeEventListener("paper-plane-snapshot", onSnapshot);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    let handle: GameHandle | null = null;
    let cancelled = false;
    createGameScene(engine, canvas).then((nextHandle) => {
      if (cancelled) {
        nextHandle.dispose();
        return;
      }
      handle = nextHandle;
      engine.runRenderLoop(() => nextHandle.scene.render());
    });

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      handle?.dispose();
      engine.dispose();
      startedRef.current = false;
    };
  }, []);

  const phaseLabel = snapshot.phase === "ready" ? "FLIGHT READY" : snapshot.phase === "playing" ? "IN FLIGHT" : snapshot.phase === "won" ? "CLEARED" : "IMPACT";
  const isTerminal = snapshot.phase === "gameover" || snapshot.phase === "won";

  return (
    <main className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" style={{ touchAction: "none" }} />
      <div className="hud" aria-live="polite">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark">↗</div>
            <div>
              <p className="eyebrow">SKYWAY / 01</p>
              <h1>PAPER PLANE</h1>
            </div>
          </div>
          <div className="flight-status"><span className={`status-dot ${snapshot.phase}`} />{phaseLabel}</div>
        </header>

        <section className="metrics-row">
          <div className="metric-card score-card">
            <span className="metric-label">SCORE</span>
            <strong>{formatScore(snapshot.score)}</strong>
            <span className="metric-foot">BEST {formatScore(snapshot.best)}</span>
          </div>
          <div className="metric-card distance-card">
            <div className="distance-heading"><span className="metric-label">DISTANCE TO GOAL</span><strong>{Math.floor(snapshot.distance)}M <em>/ 320M</em></strong></div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${snapshot.progress * 100}%` }} /><div className="plane-tick" style={{ left: `${Math.min(96, snapshot.progress * 100)}%` }}>✈</div></div>
            <div className="progress-labels"><span>LAUNCH</span><span>CHECKPOINT 03</span><span>FINISH</span></div>
          </div>
          <div className="metric-card altitude-card"><span className="metric-label">ALTITUDE</span><strong>{snapshot.altitude.toFixed(1)}<em> M</em></strong><div className="altitude-meter"><div style={{ height: `${Math.max(6, Math.min(100, (snapshot.altitude / 11.5) * 100))}%` }} /></div></div>
        </section>

        <div className="center-copy">
          <span className="direction-pill">AUTO-PILOT CORRIDOR <span>●</span></span>
          <p>Thread the gap. Keep your wings above the water.</p>
        </div>

        <div className="bottom-panel">
          {snapshot.phase === "ready" && <button className="rise-button" onClick={() => dispatchAction("rise")}><span className="tap-orb">↑</span><span><b>TAP TO RISE</b><small>or press SPACE</small></span></button>}
          {snapshot.phase === "playing" && <button className="rise-button compact" onClick={() => dispatchAction("rise")}><span className="tap-orb">↑</span><span><b>RISE</b><small>tap / space</small></span></button>}
          {isTerminal && <div className="result-card"><div className="result-kicker">{snapshot.phase === "won" ? "ROUTE COMPLETE" : "WING DAMAGE DETECTED"}</div><h2>{snapshot.phase === "won" ? "Perfect landing." : "The corridor won this round."}</h2><p>{snapshot.phase === "won" ? "You found the clean line through the skyway." : "Tap replay, then feather your altitude through each opening."}</p><button className="replay-button" onClick={() => dispatchAction("restart")}>REPLAY <span>↻</span></button></div>}
          {!isTerminal && <div className="control-hint"><span className="hint-key">SPACE</span><span>or tap anywhere to change your trajectory</span></div>}
        </div>

        <footer className="footer-note"><span>FLIGHT SYSTEMS ONLINE</span><span>AVOID THE WALLS · REACH THE LIGHT</span></footer>
      </div>
    </main>
  );
}
