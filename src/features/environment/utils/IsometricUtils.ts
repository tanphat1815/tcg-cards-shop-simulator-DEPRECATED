
/**
 * IsometricUtils.ts
 * Chuyên trách tính toán tọa độ và chuyển đổi không gian cho lưới Isometric 2:1 (64x32)
 */

export const ISO_TILE = {
  WIDTH: 64,
  HEIGHT: 32,
  HALF_W: 32,
  HALF_H: 16,
  EDGE_X: 16, // Khoảng cách từ tâm đến trung điểm cạnh theo trục X
  EDGE_Y: 8   // Khoảng cách từ tâm đến trung điểm cạnh theo trục Y
};

export const ISO_TILE_WIDTH = ISO_TILE.WIDTH;
export const ISO_TILE_HEIGHT = ISO_TILE.HEIGHT;
export const ISO_TILE_HALF_W = ISO_TILE.HALF_W;
export const ISO_TILE_HALF_H = ISO_TILE.HALF_H;

export type IsoEdge = 'NW' | 'NE' | 'SW' | 'SE';

/**
 * Tính toán tọa độ chính xác cho trung điểm của các cạnh ô gạch
 * @param centerX Tọa độ X tâm ô gạch (Screen Space)
 * @param centerY Tọa độ Y tâm ô gạch (Screen Space)
 * @param edge Cạnh cần lấy tọa độ
 */
export function getIsoEdgePos(centerX: number, centerY: number, edge: IsoEdge) {
  switch (edge) {
    case 'NW': return { x: centerX - ISO_TILE.EDGE_X, y: centerY - ISO_TILE.EDGE_Y };
    case 'NE': return { x: centerX + ISO_TILE.EDGE_X, y: centerY - ISO_TILE.EDGE_Y };
    case 'SW': return { x: centerX - ISO_TILE.EDGE_X, y: centerY + ISO_TILE.EDGE_Y };
    case 'SE': return { x: centerX + ISO_TILE.EDGE_X, y: centerY + ISO_TILE.EDGE_Y };
  }
}

/**
 * Chuyển đổi từ tọa độ Screen (pixel) ngược về tọa độ World (grid)
 */
export function screenToWorld(sx: number, sy: number, ox: number, oy: number) {
  const TILE_HW = ISO_TILE.HALF_W;
  const TILE_HH = ISO_TILE.HALF_H;
  
  const dx = sx - ox;
  const dy = sy - oy;
  
  const worldX = (dx / TILE_HW + dy / TILE_HH) / 2;
  const worldY = (dy / TILE_HH - dx / TILE_HW) / 2;
  
  return { col: worldX, row: worldY };
}

/**
 * Tính toán độ sâu (Depth) từ tọa độ Screen
 */
export function computeIsoDepthFromScreen(sx: number, sy: number, ox: number, oy: number, worldZ: number = 0, base: number = 1000) {
  const { col, row } = screenToWorld(sx, sy, ox, oy);
  return computeIsoDepth(col, row, worldZ, base);
}

/**
 * Tính toán độ sâu (Depth) chuẩn Isometric
 */
export function computeIsoDepth(col: number, row: number, worldZ: number = 0, base: number = 1000) {
  return base + (col + row) + worldZ;
}

/**
 * Chuyển đổi từ tọa độ World (grid) sang Screen (pixel)
 */
export function obliqueToIsoScreen(col: number, row: number, ox: number, oy: number) {
  const TILE_HW = ISO_TILE.HALF_W;
  const TILE_HH = ISO_TILE.HALF_H;
  return {
    x: ox + (col - row) * TILE_HW,
    y: oy + (col + row) * TILE_HH
  };
}

/**
 * Alias cho obliqueToIsoScreen để tương thích với code cũ
 */
export const worldToScreen = obliqueToIsoScreen;

export const ISO_DEPTH_BASE = 1000;
export const ISO_MOVE_Y_SCALE = 0.5;

export const DEPTH_OFFSETS = {
  WALL_TOP: 2000,   // Nắp tường luôn trên cùng
  FURNITURE: 10,    // Nội thất cao hơn sàn
  PLAYER: 20,       // Nhân vật
  SHADOW: -1        // Bóng đổ nằm dưới chân
};
