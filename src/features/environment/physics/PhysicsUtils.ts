/**
 * PhysicsUtils.ts — Tiện ích tạo Matter.js bodies cho hệ thống vật lý Isometric.
 *
 * FILE NÀY CHỨA:
 * 1. createIsometricDiamond()     — Tạo vertices hình thoi ISO 2:1
 * 2. createFootColliderVertices()  — Tạo vertices cho hitbox chân (chỉ phần dưới)
 * 3. createStaticDiamondBody()     — Tạo static body hình thoi hoàn chỉnh
 * 4. createCircleFootBody()        — Tạo circle body nhỏ cho nhân vật
 * 5. computeIsoDepthFromScreen()   — Tiện ích tính depth từ tọa độ screen
 * 6. applyMatterFootCollider()     — Áp dụng foot collider cho Matter sprite
 * 7. COLLISION_CATEGORIES          — Bit mask cho lọc va chạm
 *
 * NGUYÊN TẮC THIẾT KẾ:
 * - Hitbox CHỈ NẰM Ở DƯỚI ĐÁY sprite (vùng tiếp xúc mặt đất)
 * - Phần thân trên sprite cho phép nhân vật đi vòng phía sau (kết hợp Y-sorting)
 * - Vertices hình thoi tuân theo tỷ lệ 2:1 chuẩn isometric
 * - Tất cả body tĩnh (nội thất, tường) phải set isStatic: true
 */

import Phaser from 'phaser'

// ─── COLLISION CATEGORIES (Bit Masks) ─────────────────────────────────────────
// Dùng để lọc va chạm giữa các nhóm đối tượng khác nhau.
// Ví dụ: Player va chạm Furniture nhưng không va chạm NPC.

export const COLLISION_CATEGORIES = {
  DEFAULT:   0x0001,
  PLAYER:    0x0002,
  FURNITURE: 0x0004,
  WALL:      0x0008,
  NPC:       0x0010,
  SENSOR:    0x0020,
} as const

// ─── ISOMETRIC DIAMOND VERTICES ───────────────────────────────────────────────

/**
 * Tạo mảng vertices cho hình thoi Isometric tỷ lệ 2:1.
 *
 * Công thức cho các đỉnh hình thoi (diamond) với gốc tọa độ tại tâm:
 *   Top:    (0, -H/2)
 *   Right:  (W/2, 0)
 *   Bottom: (0, H/2)
 *   Left:   (-W/2, 0)
 *
 * Phaser Matter vertices format: mảng các { x, y } strings hoặc numbers.
 *
 * @returns       — Mảng 4 đỉnh { x, y } cho Matter.js fromVertices()
 */
export function createIsometricDiamond(): { x: number; y: number }[] {
  const hw = 32
  const hh = 16
  return [
    { x: 0,   y: -hh },  // Top
    { x: hw,  y: 0 },    // Right
    { x: 0,   y: hh },   // Bottom
    { x: -hw, y: 0 },    // Left
  ]
}

/**
 * Tạo vertices hình thoi cho "foot area" của sprite (chỉ phần chân).
 * Hitbox chỉ chiếm một phần nhỏ (footRatio) ở dưới đáy sprite,
 * cho phép nhân vật đi vòng phía sau phần trên.
 *
 * @param spriteWidth   — Chiều rộng sprite (px)
 * @param spriteHeight  — Chiều cao sprite (px)
 * @param footRatio     — Tỷ lệ chiều cao foot area (0.0 - 1.0), mặc định 0.2
 * @returns             — Vertices hình thoi cho foot area
 */
export function createFootDiamondVertices(
  spriteWidth: number,
  spriteHeight: number,
  footRatio: number = 0.2
): { x: number; y: number }[] {
  // Foot area dimensions
  const hw = (spriteWidth * 0.8) / 2
  const hh = (spriteHeight * footRatio) / 2
  return [
    { x: 0,   y: -hh },
    { x: hw,  y: 0 },
    { x: 0,   y: hh },
    { x: -hw, y: 0 },
  ]
}

// ─── MATTER.JS BODY CREATION HELPERS ──────────────────────────────────────────

/**
 * Tạo một static Matter body hình thoi tại vị trí chỉ định.
 * Dùng cho nội thất (kệ, bàn, quầy thu ngân).
 *
 * @param scene     — Phaser Scene hiện tại
 * @param x         — Tọa độ X screen
 * @param y         — Tọa độ Y screen (đáy sprite, sau khi setOrigin 0.5, 1)
 * @param width     — Chiều rộng diamond body (px)
 * @param height    — Chiều cao diamond body (px)
 * @param label     — Label để identify trong collision events
 * @returns         — MatterJS.BodyType đã được tạo
 */
/**
 * Nạp Matter Body từ file cấu hình JSON.
 * Fallback: Tự động tạo hình thoi (diamond) nếu không tìm thấy key.
 */
export function loadCustomBody(
  scene: Phaser.Scene,
  x: number,
  y: number,
  shapeKey: string,
  options: any = {}
): MatterJS.BodyType {
  try {
    const collisionData = scene.cache.json.get('iso_collisions')
    
    if (collisionData && collisionData[shapeKey]) {
      const vertices = collisionData[shapeKey]
      return scene.matter.add.fromVertices(x, y, vertices, options)
    }
    
    console.warn(`[PhysicsUtils] Key "${shapeKey}" not found in iso_collisions. Falling back to Diamond.`)
  } catch (err) {
    console.error(`[PhysicsUtils] Error loading custom body for ${shapeKey}:`, err)
  }

  // Fallback: Tạo hình thoi mặc định (Diamond) 64x32
  const vertices = createIsometricDiamond()
  return scene.matter.add.fromVertices(x, y, vertices, options)
}

/**
 * Tạo một static diamond body (cho Furniture) từ JSON hoặc mặc định.
 */
export function createStaticDiamondBody(
  scene: Phaser.Scene,
  x: number,
  y: number,
  shapeKey: string,
  label: string = 'furniture'
): MatterJS.BodyType {
  return loadCustomBody(scene, x, y, shapeKey, {
    isStatic: true,
    label: label,
    collisionFilter: {
      category: COLLISION_CATEGORIES.FURNITURE,
      mask: COLLISION_CATEGORIES.PLAYER | COLLISION_CATEGORIES.NPC,
    },
  })
}

/**
 * Tạo một static wall body dạng rectangle hoặc từ JSON.
 */
export function createStaticWallBody(
  scene: Phaser.Scene,
  x: number,
  y: number,
  _width: number,
  _height: number,
  label: string = 'wall'
): MatterJS.BodyType {
  const shapeKey = label.includes('left') ? 'iso_wall_left' : 'iso_wall_right'
  return loadCustomBody(scene, x, y, shapeKey, {
    isStatic: true,
    label,
    collisionFilter: {
      category: COLLISION_CATEGORIES.WALL,
      mask: COLLISION_CATEGORIES.PLAYER | COLLISION_CATEGORIES.NPC,
    },
  })
}

/**
 * Áp dụng Matter.js foot collider cho một sprite, hỗ trợ JSON shapeKey.
 */
export function applyMatterFootCollider(
  sprite: Phaser.Physics.Matter.Sprite,
  radiusOrShapeKey: number | string = 10,
  options: any = {}
): void {
  const scene = sprite.scene
  const isStatic = options.isStatic ?? false
  const label = options.label ?? 'entity_hitbox'
  const category = options.category ?? COLLISION_CATEGORIES.PLAYER

  try {
    let body: MatterJS.BodyType

    if (typeof radiusOrShapeKey === 'string') {
      body = loadCustomBody(scene, sprite.x, sprite.y, radiusOrShapeKey, {
        isStatic,
        label,
        collisionFilter: options.collisionFilter || {
          category: category,
          mask: COLLISION_CATEGORIES.FURNITURE | COLLISION_CATEGORIES.WALL | COLLISION_CATEGORIES.NPC | COLLISION_CATEGORIES.PLAYER,
        }
      })
    } else {
      body = scene.matter.add.circle(sprite.x, sprite.y, radiusOrShapeKey, {
        isStatic,
        label,
        collisionFilter: options.collisionFilter || {
          category: category,
          mask: COLLISION_CATEGORIES.FURNITURE | COLLISION_CATEGORIES.WALL | COLLISION_CATEGORIES.NPC | COLLISION_CATEGORIES.PLAYER,
        },
      })
    }

    sprite.setExistingBody(body)
    sprite.setFixedRotation()
    if (isStatic) sprite.setStatic(true)
  } catch (err) {
    console.error(`[PhysicsUtils] Failed to apply foot collider:`, err)
  }
}

// ─── DEPTH SORTING HELPERS ────────────────────────────────────────────────────

/**
 * Tạo config friction phù hợp cho game top-down/isometric.
 * Đảm bảo cảm giác di chuyển mượt mà, không bị "trượt băng".
 *
 * @param entityType — Loại entity: 'player' | 'npc' | 'staff'
 * @returns          — Object chứa friction settings
 */
export function getMovementFrictionConfig(entityType: 'player' | 'npc' | 'staff' = 'player'): {
  friction: number
  frictionAir: number
  frictionStatic: number
} {
  switch (entityType) {
    case 'player':
      return {
        friction: 0.1,
        frictionAir: 0.15,    // Giảm "trượt" khi thả phím
        frictionStatic: 0.5,
      }
    case 'npc':
      return {
        friction: 0.05,
        frictionAir: 0.2,     // NPC dừng nhanh hơn
        frictionStatic: 0.3,
      }
    case 'staff':
      return {
        friction: 0.05,
        frictionAir: 0.2,
        frictionStatic: 0.3,
      }
  }
}

// ─── COLLISION EVENT HELPERS ──────────────────────────────────────────────────

/**
 * Trích xuất label và gameObject từ một collision pair.
 * Dùng trong this.matter.world.on('collisionstart', ...).
 *
 * @param pair      — Collision pair từ Matter event
 * @returns         — { labelA, labelB, bodyA, bodyB, gameObjectA, gameObjectB }
 */
export function extractCollisionPair(pair: any): {
  labelA: string
  labelB: string
  bodyA: MatterJS.BodyType
  bodyB: MatterJS.BodyType
  gameObjectA: Phaser.GameObjects.GameObject | null
  gameObjectB: Phaser.GameObjects.GameObject | null
} {
  const bodyA = pair.bodyA
  const bodyB = pair.bodyB
  return {
    labelA: bodyA.label || '',
    labelB: bodyB.label || '',
    bodyA,
    bodyB,
    gameObjectA: bodyA.gameObject || null,
    gameObjectB: bodyB.gameObject || null,
  }
}

/**
 * Kiểm tra xem một collision pair có chứa hai label chỉ định không.
 * Không quan tâm thứ tự A/B.
 *
 * @param pair    — Collision pair
 * @param label1  — Label thứ nhất (ví dụ 'player')
 * @param label2  — Label thứ hai (ví dụ 'shelf')
 * @returns       — true nếu pair chứa cả hai label
 */
export function pairHasLabels(
  pair: any,
  label1: string,
  label2: string
): boolean {
  const { labelA, labelB } = extractCollisionPair(pair)
  return (labelA === label1 && labelB === label2) ||
         (labelA === label2 && labelB === label1)
}

/**
 * Từ collision pair, trả về gameObject có label chỉ định.
 * Dùng để tìm đối tượng cụ thể trong một cặp va chạm.
 *
 * @param pair   — Collision pair
 * @param label  — Label cần tìm
 * @returns      — GameObject tương ứng hoặc null
 */
export function getGameObjectByLabel(
  pair: any,
  label: string
): Phaser.GameObjects.GameObject | null {
  const { labelA, labelB, gameObjectA, gameObjectB } = extractCollisionPair(pair)
  if (labelA === label) return gameObjectA
  if (labelB === label) return gameObjectB
  return null
}
