/**
 * Centralized Depth (Z-index) configuration for Phaser game objects.
 * Higher values are drawn on top of lower values.
 */
export const DEPTH = {
  OUTSIDE: 1,
  FLOOR: 2,           // TileSprite sàn
  WALL_GRAPHICS: 3,   // (legacy — có thể xoá nếu không còn ai dùng)

  // 🆕 Y-SORT RANGE: 10 ~ 10,000 dành cho entity động/tĩnh dùng setDepth(y)

  // Giữ các key cũ để code legacy không vỡ, nhưng KHUYẾN CÁO không dùng cho sprite động.
  FURNITURE: 10,
  CASHIER: 10,
  TABLE: 10,
  NPC: 15,
  PLAYER: 20,

  // --- Wall vẫn có giá trị base, nhưng sẽ override bằng setDepth(y) trong refreshEnvironment() ---
  WALL: 50,

  // --- UI luôn trên cùng ---
  UI_TEXT: 10001,
  UI: 11000,
  EDIT_OVERLAY: 10900,
  GHOST: 10100,
  PLACEMENT_VISUALIZER: 10150,
  PREVIEW: 10200,
};

/**
 * Other rendering constants can be added here
 */
export const RENDER_CONSTANTS = {
  DASH_LEN: 10,
  GAP_LEN: 5,
  THICKNESS_WALL: 40,
  DOOR_WIDTH: 80,
};

export const EXPANSIONS_LOT_A = [
  { id: 1, cost: 500, requiredLevel: 2, rentIncrease: 10 },
  { id: 2, cost: 1500, requiredLevel: 5, rentIncrease: 25 },
  { id: 3, cost: 5000, requiredLevel: 10, rentIncrease: 60 },
  { id: 4, cost: 12000, requiredLevel: 15, rentIncrease: 150 },
  { id: 5, cost: 30000, requiredLevel: 20, rentIncrease: 400 },
];
