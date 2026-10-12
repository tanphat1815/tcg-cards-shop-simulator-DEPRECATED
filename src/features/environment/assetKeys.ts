/**
 * Bảng Texture Key trung tâm.
 * MỌI file Phaser phải import từ đây, KHÔNG được hardcode 'player', 'npc'...
 * Nếu cần thêm texture mới, thêm vào đây TRƯỚC rồi mới đi load.
 */
export const TEX = {
  // ----- Characters (Spritesheets 32x48) -----
  PLAYER: 'player_sheet',
  NPC: 'npc_sheet',
  STAFF: 'staff_sheet',

  // ----- Characters ISOMETRIC (Spritesheets 32x48, 8 dirs x 4 frames) -----
  PLAYER_ISO: 'player_iso',
  NPC_ISO: 'npc_iso',
  STAFF_ISO: 'staff_iso',

  // ----- Furniture (Images, origin giữa-đáy) -----
  SHELF_SELLING: 'shelf_selling',
  SHELF_STORAGE: 'shelf_storage',
  CASHIER_DESK: 'cashier_desk',
  PLAY_TABLE: 'play_table',
  PLAY_CHAIR: 'play_chair',
  DISPLAY_CASE: 'display_case',

  // ----- Furniture ISOMETRIC -----
  ISO_SHELF: 'iso_shelf',
  ISO_CASHIER: 'iso_cashier',
  ISO_TABLE: 'iso_table',
  ISO_BOX: 'iso_box',

  // ----- Delivery -----
  BOX_ITEM: 'box_item',
  PACKAGE_BOX: 'package_box',

  // ----- Environment -----
  FLOOR_TILE: 'floor_tile',      // 32x32 seamless
  WALL_TOP: 'wall_top',          // 32x48 (phần có chiều cao)
  WALL_SIDE: 'wall_side',        // 32x32 (phần thấp)
  SIDEWALK_TILE: 'sidewalk_tile', // 32x32

  // ----- Environment ISOMETRIC -----
  ISO_FLOOR: 'iso_floor',         // 64x32 diamond tile
  ISO_SIDEWALK: 'iso_sidewalk',   // 64x32 sidewalk
  ISO_WALL: 'iso_wall',           // 64x80 wall tile (placeholder)
  ISO_WALL_SIDE_LEFT: 'iso_wall_side_left',
  ISO_WALL_SIDE_RIGHT: 'iso_wall_side_right',
  ISO_WALL_TOP_LEFT: 'iso_wall_top_left',
  ISO_WALL_TOP_RIGHT: 'iso_wall_top_right',
} as const

export type TextureKey = typeof TEX[keyof typeof TEX]
