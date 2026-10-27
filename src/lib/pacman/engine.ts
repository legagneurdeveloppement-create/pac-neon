import {
  CellType,
  Direction,
  GhostMode,
  GhostName,
  GhostState,
  GridPosition,
  MAZE_COLS,
  MAZE_ROWS,
  PacmanState,
  Particle,
  FloatingScore,
  TILE_SIZE,
  GameStatus,
} from './types';
import {
  GHOST_HOUSE_CENTER,
  GHOST_EXIT,
  GHOST_STARTS,
  isWall,
  isWallForGhost,
  parseMaze,
  PACMAN_START,
  TUNNEL_ROW,
} from './maze';
import { soundManager } from './sound';

const DIR_VECTORS: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  none: { x: 0, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
  none: 'none',
};

export interface EngineCallbacks {
  onEatDot: () => void;
  onEatPower: () => void;
  onEatGhost: (ghost: GhostState, multiplier: number) => void;
  onPacmanDeath: () => void;
  onLevelComplete: () => void;
  onLoseLife: () => void;
}

export class PacmanEngine {
  grid: CellType[][];
  pacman: PacmanState;
  ghosts: GhostState[];
  particles: Particle[] = [];
  floatingScores: FloatingScore[] = [];
  status: GameStatus = 'menu';
  level = 1;
  score = 0;
  highScore = 0;
  lives = 3;
  dotsRemaining = 0;
  totalDots = 0;
  ghostsEaten = 0; // combo courant pendant un power
  modeTimer = 0;
  globalMode: 'chase' | 'scatter' = 'scatter';
  readyTimer = 0;
  deathTimer = 0;
  levelCompleteTimer = 0;
  gameOverTimer = 0;
  lastTime = 0;
  callbacks: EngineCallbacks;
  // Pour animation indépendante du rendu
  timeAccumulator = 0;
  // Timestamp de début de partie (pour le timing de libération des fantômes)
  private gameStartTime = 0;

  constructor(callbacks: EngineCallbacks) {
    this.callbacks = callbacks;
    this.grid = parseMaze();
    const { dots, power } = this.countPellets();
    this.totalDots = dots + power;
    this.dotsRemaining = this.totalDots;
    this.pacman = this.createPacman();
    this.ghosts = this.createGhosts();
    this.highScore = this.loadHighScore();
  }

  private loadHighScore(): number {
    if (typeof window === 'undefined') return 0;
    try {
      const v = localStorage.getItem('pacman-highscore');
      return v ? parseInt(v, 10) || 0 : 0;
    } catch {
      return 0;
    }
  }

  private saveHighScore() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('pacman-highscore', String(this.highScore));
    } catch {}
  }

  countPellets() {
    let dots = 0;
    let power = 0;
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell === 2) dots++;
        else if (cell === 3) power++;
      }
    }
    return { dots, power };
  }

  private createPacman(): PacmanState {
    const start = PACMAN_START;
    return {
      x: start.col * TILE_SIZE + TILE_SIZE / 2,
      y: start.row * TILE_SIZE + TILE_SIZE / 2,
      dir: 'left',
      nextDir: 'left',
      // Vitesse augmentée pour un gameplay réactif (était 2.2)
      speed: 3.2,
      mouthAngle: 0.2,
      mouthDir: 1,
      powered: false,
      poweredUntil: 0,
      alive: true,
      deathFrame: 0,
    };
  }

  private createGhosts(): GhostState[] {
    return GHOST_STARTS.map((g, i) => ({
      name: g.name as GhostName,
      x: g.col * TILE_SIZE + TILE_SIZE / 2,
      y: g.row * TILE_SIZE + TILE_SIZE / 2,
      dir: 'up' as Direction,
      // Vitesse augmentée pour suivre Pac-Man (était 1.8)
      speed: 2.6,
      mode: 'scatter' as GhostMode,
      color: this.ghostColor(g.name as GhostName),
      inHouse: g.name !== 'blinky',
      // Timings relatifs au début de partie (ms après gameStartTime)
      // Plus courts que l'original pour que le joueur voie vite tous les fantômes
      releaseAt: g.name === 'blinky' ? 0 : g.name === 'pinky' ? 500 : g.name === 'inky' ? 2500 : 4500,
      scaredUntil: 0,
      eatenReturnHome: false,
      exiting: false,
      targetTile: { col: 0, row: 0 },
      scatterTarget: g.scatterTarget,
      lastDecisionCol: -1,
      lastDecisionRow: -1,
    }));
  }
  private ghostColor(name: GhostName): string {
    switch (name) {
      case 'blinky': return '#FF2D6F'; // rouge néon
      case 'pinky': return '#FF7BE0';  // rose
      case 'inky': return '#3DF5FF';   // cyan
      case 'clyde': return '#FFB23D';  // orange
    }
  }

  reset() {
    this.grid = parseMaze();
    const { dots, power } = this.countPellets();
    this.totalDots = dots + power;
    this.dotsRemaining = this.totalDots;
    this.pacman = this.createPacman();
    this.ghosts = this.createGhosts();
    this.particles = [];
    this.floatingScores = [];
    this.ghostsEaten = 0;
    this.status = 'ready';
    this.readyTimer = 1800; // 1.8s "READY!"
    this.modeTimer = 0;
    this.globalMode = 'scatter';
    // Le temps de jeu commence maintenant (relatif, pas absolu)
    this.gameStartTime = performance.now();
    // Mélodie "Ready" pendant l'écran d'attente
    soundManager.play('ready');
  }

  startGame() {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.reset();
    soundManager.play('start');
  }

  togglePause() {
    if (this.status === 'playing') this.status = 'paused';
    else if (this.status === 'paused') this.status = 'playing';
  }

  setPacmanNextDir(dir: Direction) {
    if (this.status !== 'playing') return;
    this.pacman.nextDir = dir;
  }

  // Vérifie si Pac-Man peut tourner dans une direction (la case adjacente n'est pas un mur)
  private canMove(
    gridX: number,
    gridY: number,
    dir: Direction,
    isGhost: boolean,
    canCrossDoor: boolean
  ): boolean {
    const v = DIR_VECTORS[dir];
    const col = Math.floor(gridX / TILE_SIZE);
    const row = Math.floor(gridY / TILE_SIZE);
    const nextCol = col + v.x;
    const nextRow = row + v.y;
    if (isGhost) {
      return !isWallForGhost(this.grid, nextCol, nextRow, canCrossDoor);
    }
    return !isWall(this.grid, nextCol, nextRow);
  }

  // Aligne Pac-Man/ghost au centre de la case dans l'axe perpendiculaire au mouvement
  private alignToCenter(entity: { x: number; y: number }, dir: Direction) {
    const v = DIR_VECTORS[dir];
    if (v.x !== 0) {
      // mouvement horizontal -> aligner Y
      const targetY = Math.floor(entity.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
      entity.y = targetY;
    } else if (v.y !== 0) {
      const targetX = Math.floor(entity.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
      entity.x = targetX;
    }
  }

  private atTileCenter(entity: { x: number; y: number }, threshold = 2.5): boolean {
    const cx = Math.floor(entity.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
    const cy = Math.floor(entity.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
    return Math.abs(entity.x - cx) < threshold && Math.abs(entity.y - cy) < threshold;
  }

  // Vérifie si la case (col, row) est un mur pour Pac-Man ou un fantôme
  private isWallAt(col: number, row: number, isGhost: boolean, canCrossDoor: boolean): boolean {
    if (isGhost) return isWallForGhost(this.grid, col, row, canCrossDoor);
    return isWall(this.grid, col, row);
  }

  // Aligne exactement l'entité sur le centre de sa case actuelle
  private snapToCellCenter(entity: { x: number; y: number }) {
    entity.x = Math.floor(entity.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
    entity.y = Math.floor(entity.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
  }

  // Avance une entité dans la direction donnée.
  // Si la case suivante est un mur, l'entité s'arrête exactement au centre de sa case.
  // Retourne true si l'entité est arrivée au centre d'une case ce frame.
  private moveEntity(
    entity: { x: number; y: number; dir: Direction; speed: number },
    isGhost: boolean,
    canCrossDoor: boolean,
    speedOverride?: number
  ): boolean {
    if (entity.dir === 'none') return false;

    const v = DIR_VECTORS[entity.dir];
    const step = speedOverride ?? entity.speed;
    const col = Math.floor(entity.x / TILE_SIZE);
    const row = Math.floor(entity.y / TILE_SIZE);
    const nextCol = col + v.x;
    const nextRow = row + v.y;
    const wallAhead = this.isWallAt(nextCol, nextRow, isGhost, canCrossDoor);

    const cx = col * TILE_SIZE + TILE_SIZE / 2;
    const cy = row * TILE_SIZE + TILE_SIZE / 2;

    if (!wallAhead) {
      // Avancer librement
      entity.x += v.x * step;
      entity.y += v.y * step;
    } else {
      // La prochaine case est un mur : avancer jusqu'au centre, pas plus
      if (v.x > 0 && entity.x < cx) entity.x = Math.min(entity.x + step, cx);
      else if (v.x < 0 && entity.x > cx) entity.x = Math.max(entity.x - step, cx);
      else if (v.y > 0 && entity.y < cy) entity.y = Math.min(entity.y + step, cy);
      else if (v.y < 0 && entity.y > cy) entity.y = Math.max(entity.y - step, cy);
    }

    // Snap exact au centre si on est très proche (évite les imprécisions flottantes)
    const newCx = Math.floor(entity.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
    const newCy = Math.floor(entity.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
    if (Math.abs(entity.x - newCx) < 0.5) entity.x = newCx;
    if (Math.abs(entity.y - newCy) < 0.5) entity.y = newCy;

    return Math.abs(entity.x - newCx) < 0.01 && Math.abs(entity.y - newCy) < 0.01;
  }

  private updatePacman(dt: number) {
    const p = this.pacman;
    if (!p.alive) return;

    // Animation bouche
    p.mouthAngle += p.mouthDir * 0.012 * dt;
    if (p.mouthAngle > 0.5) { p.mouthAngle = 0.5; p.mouthDir = -1; }
    if (p.mouthAngle < 0) { p.mouthAngle = 0; p.mouthDir = 1; }

    // Essayer de tourner si nextDir est demandé
    if (p.nextDir !== 'none' && p.nextDir !== p.dir) {
      const isReverse = OPPOSITE[p.nextDir] === p.dir;
      if (isReverse) {
        // Demi-tour toujours autorisé
        p.dir = p.nextDir;
        this.alignToCenter(p, p.dir);
      } else if (this.atTileCenter(p)) {
        // Vérifier que la case dans nextDir n'est pas un mur
        const v = DIR_VECTORS[p.nextDir];
        const col = Math.floor(p.x / TILE_SIZE);
        const row = Math.floor(p.y / TILE_SIZE);
        if (!this.isWallAt(col + v.x, row + v.y, false, false)) {
          p.dir = p.nextDir;
          // Snap exact au centre pour tourner proprement
          this.snapToCellCenter(p);
        }
      }
    }

    // Avancer
    if (p.dir !== 'none') {
      this.moveEntity(p, false, false);
    }

    // Tunnel (téléportation)
    if (Math.floor(p.y / TILE_SIZE) === TUNNEL_ROW) {
      if (p.x < -TILE_SIZE / 2) p.x = MAZE_COLS * TILE_SIZE + TILE_SIZE / 2;
      else if (p.x > MAZE_COLS * TILE_SIZE + TILE_SIZE / 2) p.x = -TILE_SIZE / 2;
    }

    // Manger dots / power pellets
    const col = Math.floor(p.x / TILE_SIZE);
    const row = Math.floor(p.y / TILE_SIZE);
    if (col >= 0 && col < MAZE_COLS && row >= 0 && row < MAZE_ROWS) {
      const cell = this.grid[row][col];
      if (cell === 2) {
        this.grid[row][col] = 0;
        this.score += 10;
        this.dotsRemaining--;
        this.spawnParticles(col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2, '#FFD93D', 4);
        // Jouer le "waka" à CHAQUE dot mangé
        // (l'alternance wa/ka est gérée dans le sound manager lui-même)
        soundManager.play('chomp');
        this.callbacks.onEatDot();
      } else if (cell === 3) {
        this.grid[row][col] = 0;
        this.score += 50;
        this.dotsRemaining--;
        this.activatePowerMode();
        this.spawnParticles(col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2, '#FF3DF5', 12);
        soundManager.play('powerUp');
        this.callbacks.onEatPower();
      }
    }

    // Vérifier fin de niveau
    if (this.dotsRemaining === 0 && this.status === 'playing') {
      this.status = 'levelComplete';
      this.levelCompleteTimer = 2000;
      this.updateHighScore();
      soundManager.play('levelComplete');
      this.callbacks.onLevelComplete();
    }

    // Power state expiry
    if (p.powered && performance.now() > p.poweredUntil) {
      p.powered = false;
    }
  }

  private activatePowerMode() {
    const now = performance.now();
    const duration = Math.max(3000, 7000 - (this.level - 1) * 500);
    this.pacman.powered = true;
    this.pacman.poweredUntil = now + duration;
    this.ghostsEaten = 0;
    for (const g of this.ghosts) {
      if (g.mode !== 'eaten' && !g.eatenReturnHome) {
        g.mode = 'frightened';
        g.scaredUntil = now + duration;
        // Inverser direction
        g.dir = OPPOSITE[g.dir];
      }
    }
  }

  private updateGhosts(dt: number) {
    const now = performance.now();
    // Mode global chase/scatter (cycle simple)
    // Scatter 7s, chase 20s
    this.modeTimer += dt;
    if (this.globalMode === 'scatter' && this.modeTimer > 7000) {
      this.globalMode = 'chase';
      this.modeTimer = 0;
      for (const g of this.ghosts) {
        if (g.mode !== 'frightened' && g.mode !== 'eaten') {
          g.mode = 'chase';
          g.dir = OPPOSITE[g.dir];
        }
      }
    } else if (this.globalMode === 'chase' && this.modeTimer > 20000) {
      this.globalMode = 'scatter';
      this.modeTimer = 0;
      for (const g of this.ghosts) {
        if (g.mode !== 'frightened' && g.mode !== 'eaten') {
          g.mode = 'scatter';
          g.dir = OPPOSITE[g.dir];
        }
      }
    }

    // Vérifier fin de frightened
    for (const g of this.ghosts) {
      if (g.mode === 'frightened' && now > g.scaredUntil) {
        g.mode = this.globalMode;
      }
    }

    // Libérer les fantômes de la maison (timing relatif au début de partie)
    const gameElapsed = now - this.gameStartTime;
    for (const g of this.ghosts) {
      if (g.inHouse && gameElapsed > g.releaseAt) {
        // Démarrer l'animation de sortie (le fantôme va monter vers la sortie)
        g.inHouse = false;
        g.exiting = true;
        g.dir = 'up';
      }
    }

    // Déplacer chaque fantôme
    for (const g of this.ghosts) {
      // Les fantômes encore dans la maison ne se déplacent pas (ils attendent leur libération)
      if (g.inHouse) continue;
      this.moveGhost(g, dt);
    }
  }

  private moveGhost(g: GhostState, dt: number) {
    const now = performance.now();
    let speed = g.speed;
    if (g.mode === 'frightened') speed *= 0.6;
    if (g.mode === 'eaten' || g.eatenReturnHome) speed *= 2.2;
    // Ralentir dans le tunnel
    const row = Math.floor(g.y / TILE_SIZE);
    if (row === TUNNEL_ROW) speed *= 0.6;

    // Animation de sortie de la maison : le fantôme monte vers GHOST_EXIT
    // en ignorant les murs (il traverse la porte)
    if (g.exiting) {
      const exitX = GHOST_EXIT.col * TILE_SIZE + TILE_SIZE / 2;
      const exitY = GHOST_EXIT.row * TILE_SIZE + TILE_SIZE / 2;
      const dx = exitX - g.x;
      const dy = exitY - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) {
        // Arrivé à la sortie
        g.exiting = false;
        g.x = exitX;
        g.y = exitY;
        g.dir = Math.random() < 0.5 ? 'left' : 'right';
      } else {
        // Se déplacer vers la sortie (vitesse constante, ignore les murs)
        const exitSpeed = 1.2;
        g.x += (dx / dist) * exitSpeed;
        g.y += (dy / dist) * exitSpeed;
      }
      return;
    }

    // Calculer target tile
    const myCol = Math.floor(g.x / TILE_SIZE);
    const myRow = Math.floor(g.y / TILE_SIZE);

    if (g.eatenReturnHome) {
      // Retour à la maison : se déplacer vers le centre de la maison
      const homeX = GHOST_HOUSE_CENTER.col * TILE_SIZE + TILE_SIZE / 2;
      const homeY = GHOST_HOUSE_CENTER.row * TILE_SIZE + TILE_SIZE / 2;
      const dx = homeX - g.x;
      const dy = homeY - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) {
        // Arrivé à la maison -> redémarrer l'animation de sortie
        g.eatenReturnHome = false;
        g.mode = this.globalMode;
        g.inHouse = false;
        g.exiting = true;
        g.dir = 'up';
      } else {
        g.x += (dx / dist) * speed;
        g.y += (dy / dist) * speed;
      }
      return;
    }

    // Choix de direction à chaque nouvelle case (une seule décision par case)
    const canCrossDoor = g.mode === 'eaten' || g.eatenReturnHome;
    const currentCol = Math.floor(g.x / TILE_SIZE);
    const currentRow = Math.floor(g.y / TILE_SIZE);
    const cx = currentCol * TILE_SIZE + TILE_SIZE / 2;
    const cy = currentRow * TILE_SIZE + TILE_SIZE / 2;
    const distToCenter = Math.max(Math.abs(g.x - cx), Math.abs(g.y - cy));
    // On prend une décision si on est dans une nouvelle case ET proche du centre
    // (threshold < vitesse pour garantir qu'on ne passe pas à côté)
    const isNewTile = currentCol !== g.lastDecisionCol || currentRow !== g.lastDecisionRow;
    const nearCenter = distToCenter < 1.5;

    if (isNewTile && nearCenter) {
      // Marquer cette case comme visitée
      g.lastDecisionCol = currentCol;
      g.lastDecisionRow = currentRow;
      // Snap exact au centre
      g.x = cx;
      g.y = cy;

      // Définir target
      g.targetTile = this.computeGhostTarget(g);

      // Liste directions possibles (pas demi-tour, pas mur)
      const possible: Direction[] = [];
      for (const d of ['up', 'left', 'down', 'right'] as Direction[]) {
        if (OPPOSITE[d] === g.dir) continue;
        const v = DIR_VECTORS[d];
        const nc = currentCol + v.x;
        const nr = currentRow + v.y;
        if (!isWallForGhost(this.grid, nc, nr, canCrossDoor)) {
          possible.push(d);
        }
      }

      if (possible.length === 0) {
        // Demi-tour forcé
        g.dir = OPPOSITE[g.dir];
      } else if (g.mode === 'frightened') {
        // Direction aléatoire
        g.dir = possible[Math.floor(Math.random() * possible.length)];
      } else {
        // Choisir la direction qui minimise la distance à target
        let best = possible[0];
        let bestDist = Infinity;
        for (const d of possible) {
          const v = DIR_VECTORS[d];
          const nc = currentCol + v.x;
          const nr = currentRow + v.y;
          const dist = (nc - g.targetTile.col) ** 2 + (nr - g.targetTile.row) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            best = d;
          }
        }
        g.dir = best;
      }
    }

    // Avancer avec la même logique que Pac-Man (s'arrête au centre si mur devant)
    this.moveEntity(g, true, canCrossDoor, speed);

    // Tunnel
    if (Math.floor(g.y / TILE_SIZE) === TUNNEL_ROW) {
      if (g.x < -TILE_SIZE / 2) g.x = MAZE_COLS * TILE_SIZE + TILE_SIZE / 2;
      else if (g.x > MAZE_COLS * TILE_SIZE + TILE_SIZE / 2) g.x = -TILE_SIZE / 2;
    }
  }

  private computeGhostTarget(g: GhostState): GridPosition {
    const pacmanCol = Math.floor(this.pacman.x / TILE_SIZE);
    const pacmanRow = Math.floor(this.pacman.y / TILE_SIZE);

    if (g.mode === 'scatter') {
      return g.scatterTarget;
    }

    // Chase: IA spécifique à chaque fantôme
    switch (g.name) {
      case 'blinky':
        // cible Pac-Man directement
        return { col: pacmanCol, row: pacmanRow };
      case 'pinky':
        // 4 cases devant Pac-Man
        const v = DIR_VECTORS[this.pacman.dir];
        return { col: pacmanCol + v.x * 4, row: pacmanRow + v.y * 4 };
      case 'inky': {
        // 2 cases devant Pac-Man, puis vecteur inversé depuis blinky
        const v2 = DIR_VECTORS[this.pacman.dir];
        const ahead = { col: pacmanCol + v2.x * 2, row: pacmanRow + v2.y * 2 };
        const blinky = this.ghosts.find(gh => gh.name === 'blinky')!;
        const bcol = Math.floor(blinky.x / TILE_SIZE);
        const brow = Math.floor(blinky.y / TILE_SIZE);
        return { col: ahead.col * 2 - bcol, row: ahead.row * 2 - brow };
      }
      case 'clyde': {
        // Si loin, chase Pac-Man; si proche, scatter
        const dist = Math.hypot(pacmanCol - Math.floor(g.x / TILE_SIZE), pacmanRow - Math.floor(g.y / TILE_SIZE));
        return dist > 8 ? { col: pacmanCol, row: pacmanRow } : g.scatterTarget;
      }
    }
  }

  private checkCollisions() {
    if (!this.pacman.alive) return;
    const now = performance.now();
    for (const g of this.ghosts) {
      if (g.eatenReturnHome) continue;
      const dx = g.x - this.pacman.x;
      const dy = g.y - this.pacman.y;
      const dist = Math.hypot(dx, dy);
      if (dist < TILE_SIZE * 0.6) {
        if (g.mode === 'frightened') {
          // Manger le fantôme
          this.ghostsEaten++;
          const points = 200 * Math.pow(2, this.ghostsEaten - 1); // 200, 400, 800, 1600
          this.score += points;
          g.eatenReturnHome = true;
          g.mode = 'eaten';
          this.spawnParticles(g.x, g.y, g.color, 16);
          this.floatingScores.push({
            x: g.x, y: g.y, value: points, life: 1200, maxLife: 1200, color: '#3DF5FF'
          });
          soundManager.play('eatGhost');
          this.callbacks.onEatGhost(g, this.ghostsEaten);
        } else if (g.mode !== 'eaten') {
          // Pac-Man meurt
          this.pacman.alive = false;
          this.status = 'dying';
          this.deathTimer = 1800;
          soundManager.play('death');
          this.callbacks.onPacmanDeath();
          break;
        }
      }
    }
  }

  private spawnParticles(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2.5;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 600 + Math.random() * 400,
        maxLife: 1000,
        color,
        size: 1 + Math.random() * 2,
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.vy += 0.02 * dt * 0.06;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floatingScores.length - 1; i >= 0; i--) {
      const f = this.floatingScores[i];
      f.y -= 0.04 * dt;
      f.life -= dt;
      if (f.life <= 0) this.floatingScores.splice(i, 1);
    }
  }

  private updateHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHighScore();
    }
  }

  update(dt: number) {
    if (this.status === 'ready') {
      this.readyTimer -= dt;
      if (this.readyTimer <= 0) {
        this.status = 'playing';
        // Démarrer la sirène de fond au début du gameplay
        soundManager.startSiren(this.sirenLevelForDots());
      }
      return;
    }

    if (this.status === 'paused') {
      // Couper la sirène pendant la pause
      soundManager.stopSiren();
      return;
    }

    if (this.status === 'dying') {
      // Couper la sirène pendant la mort
      soundManager.stopSiren();
      this.deathTimer -= dt;
      this.pacman.deathFrame += dt * 0.06;
      if (this.deathTimer <= 0) {
        this.lives--;
        this.callbacks.onLoseLife();
        if (this.lives <= 0) {
          this.updateHighScore();
          this.status = 'gameOver';
          this.gameOverTimer = 0;
        } else {
          // Reset positions
          this.pacman = this.createPacman();
          this.ghosts = this.createGhosts();
          this.gameStartTime = performance.now(); // reset du timing de libération
          this.status = 'ready';
          this.readyTimer = 1500;
          this.modeTimer = 0;
          this.globalMode = 'scatter';
        }
      }
      return;
    }

    if (this.status === 'levelComplete') {
      soundManager.stopSiren();
      this.levelCompleteTimer -= dt;
      if (this.levelCompleteTimer <= 0) {
        this.level++;
        this.reset();
      }
      return;
    }

    if (this.status !== 'playing') {
      soundManager.stopSiren();
      return;
    }

    this.updatePacman(dt);
    this.updateGhosts(dt);
    this.checkCollisions();
    this.updateParticles(dt);
    this.updateHighScore();

    // Mettre à jour le niveau de sirène selon les dots mangés
    // (plus on a mangé de dots, plus la sirène monte en pitch)
    const newLevel = this.sirenLevelForDots();
    soundManager.updateSirenLevel(newLevel);
  }

  // Calcule le niveau de sirène (0-4) selon la progression des dots
  private sirenLevelForDots(): number {
    if (this.totalDots === 0) return 0;
    const eaten = this.totalDots - this.dotsRemaining;
    const ratio = eaten / this.totalDots;
    // 5 paliers : 0%, 20%, 40%, 60%, 80%
    if (ratio < 0.2) return 0;
    if (ratio < 0.4) return 1;
    if (ratio < 0.6) return 2;
    if (ratio < 0.8) return 3;
    return 4;
  }
}
