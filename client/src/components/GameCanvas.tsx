import { useEffect, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createGameScene, LEVEL_OPTIONS, type GameHandle, type GameSnapshot, type Level } from "@/game/scene";

const initialSnapshot: GameSnapshot = {
  phase: "ready",
  level: 1,
  levelLabel: LEVEL_OPTIONS[0].label,
  score: 0,
  distance: 0,
  altitude: 4.35,
  progress: 0,
  best: 0,
};

function formatScore(value: number) {
  return value.toLocaleString("ja-JP").padStart(5, "0");
}

function dispatchAction(action: "rise" | "restart" | `level:${Level}`) {
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

  const phaseLabel = snapshot.phase === "ready" ? "じゅんび かんりょう" : snapshot.phase === "playing" ? "ひこう中" : snapshot.phase === "won" ? "ゴール とうちゃく" : "ついらく";
  const isTerminal = snapshot.phase === "gameover" || snapshot.phase === "won";

  return (
    <main className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" style={{ touchAction: "none" }} />
      <div className="hud" aria-live="polite">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark">↗</div>
            <div>
              <p className="eyebrow">そらの かいろう 01</p>
              <h1>かみひこうき</h1>
            </div>
          </div>
          <div className="status-stack">
            <div className="level-badge">レベル{snapshot.level}・{snapshot.levelLabel}</div>
            <div className="flight-status"><span className={`status-dot ${snapshot.phase}`} />{phaseLabel}</div>
          </div>
        </header>

        <section className="metrics-row">
          <div className="metric-card score-card">
            <span className="metric-label">スコア</span>
            <strong>{formatScore(snapshot.score)}</strong>
            <span className="metric-foot">ベスト {formatScore(snapshot.best)}</span>
          </div>
          <div className="metric-card distance-card">
            <div className="distance-heading"><span className="metric-label">ゴールまでの きょり</span><strong>{Math.floor(snapshot.distance)}m <em>/ 320m</em></strong></div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${snapshot.progress * 100}%` }} /><div className="plane-tick" style={{ left: `${Math.min(96, snapshot.progress * 100)}%` }}>✈</div></div>
            <div className="progress-labels"><span>スタート</span><span>ちゅうかん</span><span>ゴール</span></div>
          </div>
          <div className="metric-card altitude-card"><span className="metric-label">たかさ</span><strong>{snapshot.altitude.toFixed(1)}<em> m</em></strong><div className="altitude-meter"><div style={{ height: `${Math.max(6, Math.min(100, (snapshot.altitude / 11.5) * 100))}%` }} /></div></div>
        </section>

        <div className="center-copy">
          <span className="direction-pill">じどう ぜんしん中 <span>●</span></span>
          <p>かべの すきまを ねらおう。水に つかないように。</p>
        </div>

        <div className="bottom-panel">
          {snapshot.phase === "ready" && (
            <div className="ready-panel">
              <div className="level-picker">
                <span className="metric-label">コースを えらぶ</span>
                <div className="level-buttons">
                  {LEVEL_OPTIONS.map(({ level, label }) => (
                    <button
                      key={level}
                      className={`level-button${level === snapshot.level ? " active" : ""}`}
                      aria-pressed={level === snapshot.level}
                      onClick={() => dispatchAction(`level:${level}`)}
                    >
                      <b>レベル{level}</b>
                      <small>{label}</small>
                    </button>
                  ))}
                </div>
              </div>
              <button className="rise-button" onClick={() => dispatchAction("rise")}><span className="tap-orb">↑</span><span><b>タップで うかぶ</b><small>スペースキーでも OK</small></span></button>
            </div>
          )}
          {snapshot.phase === "playing" && <button className="rise-button compact" onClick={() => dispatchAction("rise")}><span className="tap-orb">↑</span><span><b>うかぶ</b><small>タップ / スペース</small></span></button>}
          {isTerminal && <div className="result-card"><div className="result-kicker">{snapshot.phase === "won" ? "ゴール とうちゃく" : "つばさが こわれた"}</div><h2>{snapshot.phase === "won" ? "みごとな ひこう！" : "こんかいは ざんねん。"}</h2><p>{snapshot.phase === "won" ? "かべを ぜんぶ よけて、ゴールまで とべたね。" : "もういちど。すきまの 高さに あわせて タップしよう。"}</p><button className="replay-button" onClick={() => dispatchAction("restart")}>もういちど <span>↻</span></button><p className="result-foot">コースを かえるときも「もういちど」</p></div>}
          {!isTerminal && <div className="control-hint"><span className="hint-key">スペース</span><span>がめんの どこでも タップで うかぶ</span></div>}
        </div>

        <footer className="footer-note"><span>そうさ：タップ / スペース</span><span>かべを よけて ゴールへ</span></footer>
      </div>
    </main>
  );
}
