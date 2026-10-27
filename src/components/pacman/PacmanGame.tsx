'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { PacmanEngine } from '@/lib/pacman/engine';
import { soundManager } from '@/lib/pacman/sound';
import {
  Direction,
  GameStatus,
  GhostState,
  MAZE_COLS,
  MAZE_ROWS,
  TILE_SIZE,
} from '@/lib/pacman/types';
import { Button } from '@/components/ui/button';

const CANVAS_WIDTH = MAZE_COLS * TILE_SIZE; // 504
const CANVAS_HEIGHT = MAZE_ROWS * TILE_SIZE; // 552

export default function PacmanGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PacmanEngine | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const accumulatorRef = useRef<number>(0);
  // Fixed timestep : le moteur tourne toujours à 60 ticks logiques/s
  // indépendamment du frame rate réel (mobile = 30-60fps, desktop = 60-144fps)
  const FIXED_DT = 1000 / 60; // ~16.67ms par tick
  const MAX_UPDATES_PER_FRAME = 5; // évite le "spiral of death"

  const [status, setStatus] = useState<GameStatus>('menu');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [dotsRemaining, setDotsRemaining] = useState(0);
  const [totalDots, setTotalDots] = useState(0);
  const [muted, setMuted] = useState(false);
  const [combo, setCombo] = useState(0);
  const [powered, setPowered] = useState(false);

  // Init engine
  useEffect(() => {
    const engine = new PacmanEngine({
      onEatDot: () => setScore(engine.score),
      onEatPower: () => {
        setScore(engine.score);
        setPowered(true);
        setTimeout(() => setPowered(false), 6500);
      },
      onEatGhost: (_g, mult) => {
        setScore(engine.score);
        setCombo(mult);
        setTimeout(() => setCombo(0), 1500);
      },
      onPacmanDeath: () => {},
      onLevelComplete: () => {},
      onLoseLife: () => setLives(engine.lives),
    });
    engineRef.current = engine;
    // Les valeurs highScore/totalDots/dotsRemaining seront synchronisées
    // automatiquement par la game loop au premier frame.
  }, []);

  // Game loop
  useEffect(() => {
    if (!engineRef.current) return;
    const engine = engineRef.current;

    const loop = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      // Temps réel écoulé depuis la dernière frame (clampé à 100ms max)
      const realDt = Math.min(time - lastTimeRef.current, 100);
      lastTimeRef.current = time;

      // Accumuler le temps et consommer des "ticks" fixes de FIXED_DT
      // Le moteur tourne ainsi à 60 ticks/s quoi qu'il arrive, même sur
      // un mobile à 30fps (où chaque frame fera 2 ticks logiques)
      accumulatorRef.current += realDt;
      let updates = 0;
      while (accumulatorRef.current >= FIXED_DT && updates < MAX_UPDATES_PER_FRAME) {
        engine.update(FIXED_DT);
        accumulatorRef.current -= FIXED_DT;
        updates++;
      }
      // Si on a trop de retard, on abandonne le reste (anti spiral of death)
      if (accumulatorRef.current > FIXED_DT * MAX_UPDATES_PER_FRAME) {
        accumulatorRef.current = 0;
      }

      // Sync UI state
      setStatus(engine.status);
      setScore(engine.score);
      setHighScore(engine.highScore);
      setLives(engine.lives);
      setLevel(engine.level);
      setDotsRemaining(engine.dotsRemaining);
      setTotalDots(engine.totalDots);

      // Draw
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) draw(ctx, engine);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleStart = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    soundManager.init();
    engine.startGame();
    setStatus('ready');
  }, []);

  const handlePause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.togglePause();
    setStatus(engine.status);
  }, []);

  const handleMute = useCallback(() => {
    const m = !muted;
    setMuted(m);
    soundManager.setMuted(m);
  }, [muted]);

  const handleDir = useCallback((dir: Direction) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setPacmanNextDir(dir);
  }, []);

  // Keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
        case 'z':
        case 'Z':
          engine.setPacmanNextDir('up');
          e.preventDefault();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          engine.setPacmanNextDir('down');
          e.preventDefault();
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
        case 'q':
        case 'Q':
          engine.setPacmanNextDir('left');
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          engine.setPacmanNextDir('right');
          e.preventDefault();
          break;
        case ' ':
        case 'p':
        case 'P':
          if (engine.status === 'playing' || engine.status === 'paused') {
            engine.togglePause();
            setStatus(engine.status);
          }
          e.preventDefault();
          break;
        case 'Enter':
          if (engine.status === 'menu' || engine.status === 'gameOver') {
            handleStart();
          }
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStart]);

  // Touch controls (swipe)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let startX = 0, startY = 0;
    let active = false;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      active = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!active || e.touches.length === 0) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      const engine = engineRef.current;
      if (!engine) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        engine.setPacmanNextDir(dx > 0 ? 'right' : 'left');
      } else {
        engine.setPacmanNextDir(dy > 0 ? 'down' : 'up');
      }
      active = false;
      e.preventDefault();
    };
    const onEnd = () => { active = false; };
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    return () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
    };
  }, []);

  return (
    <div className="w-full flex flex-col items-center gap-4">
      {/* HUD supérieur */}
      <div className="w-full max-w-[560px] flex items-center justify-between gap-2 px-2">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/70 font-mono">Score</span>
          <span className="text-2xl md:text-3xl font-bold text-yellow-300 font-mono tabular-nums drop-shadow-[0_0_8px_rgba(253,224,71,0.7)]">
            {score.toString().padStart(6, '0')}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/70 font-mono">Niveau</span>
          <span className="text-2xl md:text-3xl font-bold text-cyan-300 font-mono tabular-nums drop-shadow-[0_0_8px_rgba(34,211,238,0.7)]">
            {level}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/70 font-mono">Record</span>
          <span className="text-2xl md:text-3xl font-bold text-fuchsia-400 font-mono tabular-nums drop-shadow-[0_0_8px_rgba(232,121,249,0.7)]">
            {highScore.toString().padStart(6, '0')}
          </span>
        </div>
      </div>

      {/* Canvas + overlays */}
      <div
        className="relative rounded-2xl p-2 md:p-3 bg-gradient-to-br from-[#0a0a23] via-[#0d0d2e] to-[#1a0a2e] shadow-[0_0_40px_rgba(34,211,238,0.25),inset_0_0_30px_rgba(232,121,249,0.15)] border border-cyan-500/30"
        style={{ touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block max-w-full h-auto rounded-lg"
          style={{
            imageRendering: 'pixelated',
            width: 'min(92vw, 504px)',
            height: 'auto',
          }}
        />

        {/* Combo indicator */}
        {combo > 0 && (
          <div className="absolute top-4 right-4 pointer-events-none">
            <div className="px-3 py-1 rounded-full bg-fuchsia-500/30 border border-fuchsia-400 backdrop-blur-sm animate-pulse">
              <span className="text-fuchsia-200 font-mono text-sm font-bold">
                x{combo} {combo === 1 ? 'GHOST' : 'GHOSTS'}
              </span>
            </div>
          </div>
        )}

        {/* Power mode indicator */}
        {powered && status === 'playing' && (
          <div className="absolute top-4 left-4 pointer-events-none">
            <div className="px-3 py-1 rounded-full bg-cyan-500/30 border border-cyan-400 backdrop-blur-sm">
              <span className="text-cyan-200 font-mono text-xs font-bold animate-pulse">
                ⚡ POWER
              </span>
            </div>
          </div>
        )}

        {/* Overlays Menu / GameOver / Ready / Paused */}
        {status === 'menu' && (
          <Overlay>
            <div className="text-center px-6">
              <h1 className="text-5xl md:text-6xl font-black tracking-tight bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(253,224,71,0.5)] mb-2">
                PAC-NEON
              </h1>
              <p className="text-cyan-200/80 text-sm md:text-base mb-6 font-mono">
                Mangez tous les points. Évitez les fantômes.
                <br />
                Les pastilles power rendent les fantômes vulnérables.
              </p>
              <Button
                onClick={handleStart}
                size="lg"
                className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-black font-bold text-lg px-8 shadow-[0_0_20px_rgba(253,224,71,0.6)]"
              >
                ▶ JOUER
              </Button>
              <div className="mt-6 text-xs text-cyan-300/60 font-mono space-y-1">
                <p>⬆️⬇️⬅️➡️ / Z Q S D — Déplacement</p>
                <p>Espace / P — Pause</p>
                <p className="md:hidden">👆 Glissez pour bouger (mobile)</p>
              </div>
            </div>
          </Overlay>
        )}

        {status === 'ready' && (
          <Overlay blur={false}>
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-black text-yellow-300 drop-shadow-[0_0_15px_rgba(253,224,71,0.7)] animate-pulse">
                PRÊT ?
              </h2>
              <p className="text-cyan-300/70 mt-2 font-mono text-sm">Niveau {level}</p>
            </div>
          </Overlay>
        )}

        {status === 'paused' && (
          <Overlay>
            <div className="text-center">
              <h2 className="text-4xl font-black text-cyan-300 mb-4 drop-shadow-[0_0_15px_rgba(34,211,238,0.7)]">
                PAUSE
              </h2>
              <Button
                onClick={handlePause}
                className="bg-cyan-400 hover:bg-cyan-300 text-black font-bold"
              >
                ▶ Reprendre
              </Button>
            </div>
          </Overlay>
        )}

        {status === 'levelComplete' && (
          <Overlay>
            <div className="text-center">
              <h2 className="text-4xl font-black text-emerald-300 drop-shadow-[0_0_15px_rgba(110,231,183,0.7)] mb-2">
                NIVEAU {level} TERMINÉ !
              </h2>
              <p className="text-cyan-200/80 font-mono text-sm">Niveau suivant...</p>
            </div>
          </Overlay>
        )}

        {status === 'gameOver' && (
          <Overlay>
            <div className="text-center px-6">
              <h2 className="text-5xl font-black text-rose-400 drop-shadow-[0_0_20px_rgba(251,113,133,0.7)] mb-3">
                GAME OVER
              </h2>
              <div className="mb-6 space-y-1 font-mono">
                <p className="text-yellow-300 text-xl">Score : {score.toLocaleString()}</p>
                <p className="text-fuchsia-300 text-sm">Record : {highScore.toLocaleString()}</p>
                <p className="text-cyan-300/70 text-xs">Niveau atteint : {level}</p>
              </div>
              <Button
                onClick={handleStart}
                size="lg"
                className="bg-gradient-to-r from-rose-500 to-fuchsia-500 hover:from-rose-400 hover:to-fuchsia-400 text-white font-bold"
              >
                ↻ REJOUER
              </Button>
            </div>
          </Overlay>
        )}
      </div>

      {/* HUD inférieur : vies + contrôles */}
      <div className="w-full max-w-[560px] flex flex-col gap-3">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/70 font-mono">Vies</span>
            <div className="flex gap-1.5">
              {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
                <div
                  key={i}
                  className="w-5 h-5 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(253,224,71,0.8)]"
                  style={{
                    clipPath: 'polygon(50% 50%, 100% 30%, 100% 0%, 0% 0%, 0% 100%, 100% 100%, 100% 70%)',
                  }}
                />
              ))}
              {lives === 0 && (
                <span className="text-rose-400 font-mono text-xs ml-2">—</span>
              )}
            </div>
          </div>

          {/* Progression dots */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/70 font-mono">
              Progression
            </span>
            <div className="w-24 h-2 rounded-full bg-slate-800/60 overflow-hidden border border-cyan-500/20">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-400 transition-all duration-300"
                style={{
                  width: `${totalDots > 0 ? ((totalDots - dotsRemaining) / totalDots) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Boutons contrôle */}
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleMute}
              className="text-cyan-300 hover:text-cyan-100 hover:bg-cyan-500/10 h-8 w-8"
              aria-label={muted ? 'Activer le son' : 'Couper le son'}
            >
              {muted ? '🔇' : '🔊'}
            </Button>
            {(status === 'playing' || status === 'paused') && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePause}
                className="text-cyan-300 hover:text-cyan-100 hover:bg-cyan-500/10 h-8 w-8"
                aria-label="Pause"
              >
                {status === 'paused' ? '▶' : '⏸'}
              </Button>
            )}
          </div>
        </div>

        {/* Contrôles mobiles (D-pad tactile) */}
        <div className="md:hidden grid grid-cols-3 gap-2 max-w-[200px] mx-auto select-none">
          <div />
          <DPadButton dir="up" onDir={handleDir} label="⬆" />
          <div />
          <DPadButton dir="left" onDir={handleDir} label="⬅" />
          <DPadButton dir="down" onDir={handleDir} label="⬇" />
          <DPadButton dir="right" onDir={handleDir} label="➡" />
        </div>
      </div>
    </div>
  );
}

function Overlay({ children, blur = true }: { children: React.ReactNode; blur?: boolean }) {
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center rounded-lg ${
        blur ? 'bg-black/70 backdrop-blur-sm' : 'bg-black/40'
      }`}
    >
      {children}
    </div>
  );
}

function DPadButton({
  dir,
  onDir,
  label,
}: {
  dir: Direction;
  onDir: (d: Direction) => void;
  label: string;
}) {
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        onDir(dir);
      }}
      className="aspect-square rounded-xl bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 text-xl active:bg-cyan-500/30 active:scale-95 transition-all flex items-center justify-center"
      aria-label={dir}
    >
      {label}
    </button>
  );
}

// === Rendu Canvas ===
function draw(ctx: CanvasRenderingContext2D, engine: PacmanEngine) {
  const w = CANVAS_WIDTH;
  const h = CANVAS_HEIGHT;

  // Fond avec dégradé
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#08081a');
  grad.addColorStop(0.5, '#0a0a26');
  grad.addColorStop(1, '#120828');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle grid (étoiles / points)
  drawStarfield(ctx, w, h);

  // Labyrinthe
  drawMaze(ctx, engine);

  // Dots et power pellets
  drawPellets(ctx, engine);

  // Particules
  drawParticles(ctx, engine);

  // Pac-Man
  drawPacman(ctx, engine);

  // Fantômes
  for (const g of engine.ghosts) {
    drawGhost(ctx, engine, g);
  }

  // Floating scores
  drawFloatingScores(ctx, engine);

  // Si dying, animation de mort
  if (engine.status === 'dying') {
    // Pac-Man déjà dessiné en train de se fermer / disparaître
  }
}

let starCache: { x: number; y: number; r: number }[] | null = null;
function drawStarfield(ctx: CanvasRenderingContext2D, w: number, h: number) {
  if (!starCache) {
    starCache = [];
    for (let i = 0; i < 60; i++) {
      starCache.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.3,
      });
    }
  }
  ctx.fillStyle = 'rgba(180, 200, 255, 0.35)';
  for (const s of starCache) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMaze(ctx: CanvasRenderingContext2D, engine: PacmanEngine) {
  const grid = engine.grid;
  // Couleurs murs - dégradé cyan/violet néon
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      const cell = grid[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      if (cell === 1) {
        // Mur avec effet néon
        // Couleur de base
        const isPowered = engine.pacman.powered;
        const color1 = isPowered ? '#3DF5FF' : '#22D3EE';
        const color2 = isPowered ? '#FF7BE0' : '#A78BFA';

        // Remplissage interne plus sombre
        ctx.fillStyle = 'rgba(20, 25, 60, 0.5)';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        // Bordure néon
        ctx.strokeStyle = color1;
        ctx.lineWidth = 2;
        ctx.shadowColor = color1;
        ctx.shadowBlur = isPowered ? 12 : 8;
        roundRect(ctx, x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4, 4);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Accent interne
        ctx.strokeStyle = color2;
        ctx.lineWidth = 0.6;
        ctx.globalAlpha = 0.5;
        roundRect(ctx, x + 5, y + 5, TILE_SIZE - 10, TILE_SIZE - 10, 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (cell === 4) {
        // Porte fantôme
        ctx.fillStyle = '#FF7BE0';
        ctx.shadowColor = '#FF7BE0';
        ctx.shadowBlur = 8;
        ctx.fillRect(x + 2, y + TILE_SIZE / 2 - 2, TILE_SIZE - 4, 4);
        ctx.shadowBlur = 0;
      }
    }
  }
}

function drawPellets(ctx: CanvasRenderingContext2D, engine: PacmanEngine) {
  const grid = engine.grid;
  const t = performance.now() / 1000;
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      const cell = grid[r][c];
      const x = c * TILE_SIZE + TILE_SIZE / 2;
      const y = r * TILE_SIZE + TILE_SIZE / 2;
      if (cell === 2) {
        // Petit dot
        ctx.fillStyle = '#FFE6A0';
        ctx.shadowColor = '#FFD93D';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (cell === 3) {
        // Power pellet pulsant
        const pulse = 4.5 + Math.sin(t * 4) * 1.8;
        ctx.fillStyle = '#FF3DF5';
        ctx.shadowColor = '#FF3DF5';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(x, y, pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // halo
        ctx.fillStyle = 'rgba(255, 61, 245, 0.2)';
        ctx.beginPath();
        ctx.arc(x, y, pulse + 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawPacman(ctx: CanvasRenderingContext2D, engine: PacmanEngine) {
  const p = engine.pacman;
  if (!p.alive && engine.status !== 'dying') return;

  ctx.save();
  ctx.translate(p.x, p.y);

  if (engine.status === 'dying') {
    // Animation de mort : tourne et se ferme
    const progress = Math.min(1, p.deathFrame / 30);
    const angle = progress * Math.PI;
    ctx.rotate(progress * Math.PI * 2);
    ctx.fillStyle = '#FFD93D';
    ctx.shadowColor = '#FFD93D';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(0, 0, TILE_SIZE / 2 - 1, angle, Math.PI * 2 - angle);
    ctx.lineTo(0, 0);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    return;
  }

  // Rotation selon direction
  const rotMap: Record<string, number> = {
    right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2, none: 0,
  };
  ctx.rotate(rotMap[p.dir] ?? 0);

  const r = TILE_SIZE / 2 - 1;
  const mouth = p.mouthAngle * Math.PI;

  // Glow halo si power
  if (p.powered) {
    const t = performance.now() / 200;
    ctx.fillStyle = `rgba(61, 245, 255, ${0.18 + Math.sin(t) * 0.05})`;
    ctx.beginPath();
    ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Corps
  ctx.fillStyle = p.powered ? '#FFEA60' : '#FFD93D';
  ctx.shadowColor = p.powered ? '#3DF5FF' : '#FFD93D';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(0, 0, r, mouth, Math.PI * 2 - mouth);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // Petit reflet
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.arc(-r / 3, -r / 3, r / 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawGhost(ctx: CanvasRenderingContext2D, engine: PacmanEngine, g: GhostState) {
  const r = TILE_SIZE / 2 - 1;
  ctx.save();
  ctx.translate(g.x, g.y);

  const now = performance.now();
  let bodyColor = g.color;
  let eyeColor = '#FFFFFF';
  let pupilColor = '#0a0a26';

  if (g.mode === 'frightened') {
    // Bleu foncé clignotant à la fin
    const remaining = g.scaredUntil - now;
    const blinking = remaining < 2000 && Math.floor(now / 200) % 2 === 0;
    bodyColor = blinking ? '#FFFFFF' : '#3344FF';
    eyeColor = blinking ? '#FF3333' : '#FFFFFF';
    pupilColor = blinking ? '#FF3333' : '#FFFFFF';
  } else if (g.eatenReturnHome) {
    // Seulement les yeux
    bodyColor = 'transparent';
  }

  // Halo pour mode normal
  if (g.mode !== 'frightened' && !g.eatenReturnHome) {
    ctx.fillStyle = bodyColor + '33';
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (bodyColor !== 'transparent') {
    ctx.fillStyle = bodyColor;
    ctx.shadowColor = bodyColor;
    ctx.shadowBlur = 10;
    // Corps : demi-cercle + vagues en bas
    ctx.beginPath();
    ctx.arc(0, -2, r, Math.PI, 0);
    // vagues
    const waveOffset = Math.sin(now / 150) * 1.5;
    const bottom = r - 2;
    ctx.lineTo(r, bottom);
    const waves = 4;
    const stepW = (r * 2) / waves;
    for (let i = 0; i < waves; i++) {
      const xStart = r - i * stepW;
      const xMid = xStart - stepW / 2;
      const xEnd = xStart - stepW;
      ctx.quadraticCurveTo(xMid, bottom + 4 + waveOffset, xEnd, bottom);
    }
    ctx.lineTo(-r, -2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Yeux
  const eyeOffset = g.mode === 'frightened' ? 0 : 3;
  const eyeR = g.mode === 'frightened' ? 2.5 : 3.5;
  ctx.fillStyle = eyeColor;
  ctx.beginPath();
  ctx.arc(-eyeOffset, -3, eyeR, 0, Math.PI * 2);
  ctx.arc(eyeOffset, -3, eyeR, 0, Math.PI * 2);
  ctx.fill();

  // Pupilles qui regardent dans la direction
  if (g.mode !== 'frightened') {
    const dirVec = { up: [0, -1.5], down: [0, 1.5], left: [-1.5, 0], right: [1.5, 0], none: [0, 0] }[g.dir];
    ctx.fillStyle = pupilColor;
    ctx.beginPath();
    ctx.arc(-eyeOffset + dirVec[0], -3 + dirVec[1], 1.8, 0, Math.PI * 2);
    ctx.arc(eyeOffset + dirVec[0], -3 + dirVec[1], 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, engine: PacmanEngine) {
  for (const p of engine.particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawFloatingScores(ctx: CanvasRenderingContext2D, engine: PacmanEngine) {
  for (const f of engine.floatingScores) {
    const alpha = Math.max(0, f.life / f.maxLife);
    ctx.fillStyle = f.color;
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 8;
    ctx.fillText(`+${f.value}`, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.textAlign = 'left';
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
