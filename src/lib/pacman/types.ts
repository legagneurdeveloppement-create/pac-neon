// Types pour le jeu Pac-Man moderne

export type CellType = 0 | 1 | 2 | 3 | 4;
// 0 = vide (couloir), 1 = mur, 2 = dot, 3 = power pellet, 4 = porte fantôme

export type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

export interface Position {
  x: number; // pixel
  y: number; // pixel
}

export interface GridPosition {
  col: number;
  row: number;
}

export interface PacmanState {
  x: number;
  y: number;
  dir: Direction;
  nextDir: Direction;
  speed: number;
  mouthAngle: number;
  mouthDir: number; // 1 = ouvre, -1 = ferme
  powered: boolean;
  poweredUntil: number;
  alive: boolean;
  deathFrame: number;
}

export type GhostMode = 'chase' | 'scatter' | 'frightened' | 'eaten';

export type GhostName = 'blinky' | 'pinky' | 'inky' | 'clyde';

export interface GhostState {
  name: GhostName;
  x: number;
  y: number;
  dir: Direction;
  speed: number;
  mode: GhostMode;
  color: string;
  inHouse: boolean;
  releaseAt: number; // timestamp
  scaredUntil: number;
  eatenReturnHome: boolean;
  exiting: boolean; // en train de sortir de la maison (animation)
  // Pour IA
  targetTile: GridPosition;
  scatterTarget: GridPosition;
  // Tracker la dernière case où une décision a été prise (évite les boucles)
  lastDecisionCol: number;
  lastDecisionRow: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface FloatingScore {
  x: number;
  y: number;
  value: number;
  life: number;
  maxLife: number;
  color: string;
}

export type GameStatus = 'menu' | 'ready' | 'playing' | 'paused' | 'dying' | 'levelComplete' | 'gameOver';

export interface GameStats {
  score: number;
  highScore: number;
  lives: number;
  level: number;
  dotsRemaining: number;
  totalDots: number;
  ghostsEaten: number; // multiplier combo
}

export const TILE_SIZE = 24;
export const MAZE_COLS = 21;
export const MAZE_ROWS = 22;
