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

  // ----- Furniture (Images, origin giữa-đáy) -----
  SHELF_SELLING: 'shelf_selling',
  SHELF_STORAGE: 'shelf_storage',
  CASHIER_DESK: 'cashier_desk',
  PLAY_TABLE: 'play_table',
  PLAY_CHAIR: 'play_chair',
  DISPLAY_CASE: 'display_case',

  // ----- Delivery -----
  BOX_ITEM: 'box_item',

  // ----- Environment -----
  FLOOR_TILE: 'floor_tile',      // 32x32 seamless
  WALL_TOP: 'wall_top',          // 32x48 (phần có chiều cao)
  WALL_SIDE: 'wall_side',        // 32x32 (phần thấp)
  SIDEWALK_TILE: 'sidewalk_tile' // 32x32
} as const

export type TextureKey = typeof TEX[keyof typeof TEX]
