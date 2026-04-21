/**
 * Centralized Depth (Z-index) configuration for Phaser game objects.
 * Higher values are drawn on top of lower values.
 */
export const DEPTH = {
  // ── LAYER 1: Floor (always bottom) ──────────────────────────────
  LAYER1_FLOOR: 10,

  // ── LAYER 2: Wall Base / low walls (behind entities' feet) ──────
  LAYER2_WALL_BASE: 20,

  // ── LAYER 3: Dynamic Y-Sort Objects ─────────────────────────────
  // Formula: LAYER3_OBJECTS + sprite.y
  // With zoom 2.5x and shop ~600px tall, y range ≈ 1000–1600.
  // So Layer 3 objects occupy depth range ~1100–1700.
  LAYER3_OBJECTS: 100,

  // ── LAYER 4: Wall Top / overhangs (always above entities) ───────
  LAYER4_WALL_TOP: 9000,

  // ── Legacy aliases (kept for backwards compatibility) ───────────
  OUTSIDE: 1,
  FLOOR: 10,           // alias → LAYER1_FLOOR
  WALL_GRAPHICS: 20,   // alias → LAYER2_WALL_BASE
  FURNITURE: 100,      // base; actual depth set via applyStaticYSort
  CASHIER: 100,
  TABLE: 100,
  NPC: 100,
  PLAYER: 100,
  WALL: 20,            // alias → LAYER2_WALL_BASE

  // ── UI (always on top of everything) ────────────────────────────
  UI_TEXT: 9500,
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
