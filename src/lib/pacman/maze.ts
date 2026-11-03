import { CellType, MAZE_COLS, MAZE_ROWS } from './types';

// Labyrinthe 21 colonnes x 22 lignes
// Légende:
//  # = mur (1), . = dot (2), o = power pellet (3), - = porte fantôme (4)
//  ' ' = vide (0), G = position de départ fantôme (vide)

// === 3 LABYRINTHES DISTINCTS ===
// Chaque niveau cycle entre ces 3 layouts

const MAZE_STRINGS: string[] = [
  // --- Labyrinthe 1 : Classique symétrique ---
  `
#####################
#.........#.........#
#o###.###.#.###.###o#
#.###.###.#.###.###.#
#...................#
#.###.#.#####.#.###.#
#.....#...#...#.....#
#####.###.#.###.#####
    #.#       #.#
#####.# ##-## #.#####
     .  #G G#  .
#####.# ##### #.#####
    #.#       #.#
#####.###.#.###.#####
#.........#.........#
#.###.###.#.###.###.#
#o..#...........#..o#
###.#.#.#####.#.#.###
#.....#...#...#.....#
#.#######.#.#######.#
#...................#
#####################
`,
  // --- Labyrinthe 2 : Plus ouvert, avec îlots centraux ---
  `
#####################
#o.................o#
#.###.#.#####.#.###.#
#.....#.......#.....#
###.###.#####.###.###
#.....#.......#.....#
#.###.#.#####.#.###.#
#.........#.........#
#####.###.#.###.#####
    #.#       #.#
#####.# ##-## #.#####
     .  #G G#  .
#####.# ##### #.#####
    #.#       #.#
#####.###.#.###.#####
#.........#.........#
#.###.#.#####.#.###.#
#.....#.......#.....#
###.###.#####.###.###
#o.................o#
#...................#
#####################
`,
  // --- Labyrinthe 3 : Couloirs sinueux, plus de murs ---
  `
#####################
#.........#.........#
#o##.####.#.####.##o#
#.................#.#
#.######.###.######.#
#......#.....#......#
###.##.##.#.##.##.###
#.........#.........#
#####.###.#.###.#####
    #.#       #.#
#####.# ##-## #.#####
     .  #G G#  .
#####.# ##### #.#####
    #.#       #.#
#####.###.#.###.#####
#.........#.........#
###.##.##.#.##.##.###
#......#.....#......#
#.######.###.######.#
#o.................o#
#...................#
#####################
`,
];

// === THÈMES VISUELS PAR LABYRINTHE ===
export interface MazeTheme {
  wallColor: string;       // couleur des murs
  wallGlowColor: string;   // couleur du glow
  accentColor: string;     // couleur d'accent interne
  dotColor: string;        // couleur des dots
  powerColor: string;      // couleur des power pellets
  bgGradient: [string, string, string]; // dégradé de fond
}

export const MAZE_THEMES: MazeTheme[] = [
  // Thème 1 : Cyan / Magenta (original)
  {
    wallColor: '#22D3EE',
    wallGlowColor: '#22D3EE',
    accentColor: '#A78BFA',
    dotColor: '#FFE6A0',
    powerColor: '#FF3DF5',
    bgGradient: ['#08081a', '#0a0a26', '#120828'],
  },
  // Thème 2 : Vert / Orange
  {
    wallColor: '#34D399',
    wallGlowColor: '#34D399',
    accentColor: '#FBBF24',
    dotColor: '#FEF3C7',
    powerColor: '#F97316',
    bgGradient: ['#0a1a0e', '#0d2415', '#1a2810'],
  },
  // Thème 3 : Rose / Bleu électrique
  {
    wallColor: '#F472B6',
    wallGlowColor: '#F472B6',
    accentColor: '#60A5FA',
    dotColor: '#FBCFE8',
    powerColor: '#3B82F6',
    bgGradient: ['#1a0820', '#241030', '#281040'],
  },
];

export function getMazeTheme(level: number): MazeTheme {
  // Cycle : niveau 1 → thème 0, niveau 2 → thème 1, niveau 3 → thème 2, niveau 4 → thème 0...
  return MAZE_THEMES[(level - 1) % MAZE_THEMES.length];
}

export function getMazeIndex(level: number): number {
  return (level - 1) % MAZE_STRINGS.length;
}

// Conversion string -> tableau numérique
export function parseMaze(level = 1): CellType[][] {
  const idx = getMazeIndex(level);
  const lines = MAZE_STRINGS[idx].trim().split('\n');
  const grid: CellType[][] = [];
  for (let r = 0; r < MAZE_ROWS; r++) {
    const row: CellType[] = [];
    const line = lines[r] || '';
    for (let c = 0; c < MAZE_COLS; c++) {
      const ch = line[c] || ' ';
      switch (ch) {
        case '#': row.push(1); break;
        case '.': row.push(2); break;
        case 'o': row.push(3); break;
        case '-': row.push(4); break;
        default: row.push(0); // ' ', 'G', 'P'
      }
    }
    grid.push(row);
  }
  return grid;
}

// Positions de départ (en tiles) — identiques pour tous les labyrinthes
export const PACMAN_START = { col: 10, row: 16 };
export const GHOST_HOUSE_CENTER = { col: 10, row: 10 };
export const GHOST_EXIT = { col: 10, row: 8 };

export const GHOST_STARTS = [
  { name: 'blinky' as const, col: 10, row: 8, scatterTarget: { col: 19, row: 1 } },
  { name: 'pinky' as const, col: 9, row: 10, scatterTarget: { col: 1, row: 1 } },
  { name: 'inky' as const, col: 10, row: 10, scatterTarget: { col: 19, row: 20 } },
  { name: 'clyde' as const, col: 11, row: 10, scatterTarget: { col: 1, row: 20 } },
];

export const TUNNEL_ROW = 10;

export function isWall(grid: CellType[][], col: number, row: number): boolean {
  if (col < 0 || col >= MAZE_COLS) return false;
  if (row < 0 || row >= MAZE_ROWS) return true;
  return grid[row][col] === 1 || grid[row][col] === 4;
}

export function isWallForGhost(
  grid: CellType[][],
  col: number,
  row: number,
  canCrossDoor: boolean
): boolean {
  if (col < 0 || col >= MAZE_COLS) return false;
  if (row < 0 || row >= MAZE_ROWS) return true;
  const cell = grid[row][col];
  if (cell === 1) return true;
  if (cell === 4 && !canCrossDoor) return true;
  return false;
}

export function countPellets(grid: CellType[][]): { dots: number; power: number } {
  let dots = 0;
  let power = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell === 2) dots++;
      else if (cell === 3) power++;
    }
  }
  return { dots, power };
}
