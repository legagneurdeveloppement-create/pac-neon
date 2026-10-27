import { CellType, MAZE_COLS, MAZE_ROWS } from './types';

// Labyrinthe 21 colonnes x 22 lignes
// Légende:
//  # = mur (1)
//  . = dot (2)
//  o = power pellet (3)
//  - = porte fantôme (4)
//  ' ' = vide (0)
//  G = position de départ fantôme (vide, on ignore la valeur)

const MAZE_STRING = `
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
`;

// Conversion string -> tableau numérique
export function parseMaze(): CellType[][] {
  const lines = MAZE_STRING.trim().split('\n');
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

// Positions de départ (en tiles)
// Pac-Man dans le couloir horizontal central-bas (row 16, col 10 = corridor)
export const PACMAN_START = { col: 10, row: 16 };
// Centre de la maison des fantômes (row 10, col 10 = intérieur)
export const GHOST_HOUSE_CENTER = { col: 10, row: 10 };
// Position de sortie (juste au-dessus de la porte, dans le couloir extérieur)
export const GHOST_EXIT = { col: 10, row: 8 };

export const GHOST_STARTS = [
  // Blinky commence déjà dehors, au-dessus de la porte
  { name: 'blinky' as const, col: 10, row: 8, scatterTarget: { col: 19, row: 1 } },
  // Les autres dans la maison
  { name: 'pinky' as const, col: 9, row: 10, scatterTarget: { col: 1, row: 1 } },
  { name: 'inky' as const, col: 10, row: 10, scatterTarget: { col: 19, row: 20 } },
  { name: 'clyde' as const, col: 11, row: 10, scatterTarget: { col: 1, row: 20 } },
];

// Tunnel (téléportation horizontale) sur la ligne 10 (la ligne ouverte sur les côtés)
export const TUNNEL_ROW = 10;

// Vérifie si une case est un mur
export function isWall(grid: CellType[][], col: number, row: number): boolean {
  if (col < 0 || col >= MAZE_COLS) return false; // tunnel
  if (row < 0 || row >= MAZE_ROWS) return true;
  return grid[row][col] === 1 || grid[row][col] === 4;
}

// Vérifie si une case est un mur pour un fantôme (les fantômes ne peuvent pas
// traverser la porte fantôme sauf en mode eaten)
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

// Compte le total de dots et power pellets
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
