/**
 * Centralized Depth (Z-index) configuration for Phaser game objects.
 * Higher values are drawn on top of lower values.
 *
 * ─── ORTHOGONAL MODE (2.5D Top-Down Oblique) ───────────────────────────────
 * Uses simple Y-sorting: depth = LAYER3_OBJECTS + sprite.y
 * Origin must be (0.5, 1) — foot position.
 *
 * ─── ISOMETRIC MODE ─────────────────────────────────────────────────────────
 * Uses 3D depth formula: depth = DEPTH_BASE + worldX + worldY + worldZ
 * Each moving entity's depth is recalculated every frame based on grid position.
 * Static entities are sorted once at spawn time.
 * See src/features/environment/utils/IsometricDepthManager.ts for full implementation.
 */
export const DEPTH = {
  // ── LAYER 1: Floor (always bottom) ──────────────────────────────
  LAYER1_FLOOR: 10,

  // ── LAYER 2: Wall Base / low walls (behind entities' feet) ──────
  LAYER2_WALL_BASE: 20,

  // ── LAYER 3: Dynamic Objects ─────────────────────────────────────
  // ORTHOGONAL: Formula = LAYER3_OBJECTS + sprite.y
  // ISOMETRIC:   Formula = DEPTH_BASE + worldX + worldY + worldZ
  LAYER3_OBJECTS: 100,

  // ── ISOMETRIC DEPTH BASE ─────────────────────────────────────────
  // Use this as baseDepth when calling computeIsoDepth()
  ISO_DEPTH_BASE: 100,

  // ── LAYER 4: Wall Top / overhangs (always above entities) ───────
  LAYER4_WALL_TOP: 9000,

  // ── Legacy aliases (kept for backwards compatibility) ────────────
  OUTSIDE: 1,
  FLOOR: 10,           // alias → LAYER1_FLOOR
  WALL_GRAPHICS: 20,   // alias → LAYER2_WALL_BASE
  FURNITURE: 100,      // base; actual depth set via applyStaticYSort / applyStaticIsoDepth
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
