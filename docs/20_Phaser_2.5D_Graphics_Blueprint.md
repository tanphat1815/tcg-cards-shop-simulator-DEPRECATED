# 20 — Phaser 2.5D Graphics Blueprint

> **Tác giả:** System Architect & Lead Game Developer  
> **Dự án:** Pokémon TCG Shop Simulator (Vue 3 + Pinia + Phaser 3)  
> **Mục tiêu:** Nâng cấp đồ họa từ các hình khối cơ bản (Rectangle/Circle) sang **2.5D Orthogonal Top-Down** (phong cách Stardew Valley / Graveyard Keeper) bằng Sprite/Image, **KHÔNG PHÁ VỠ** các hệ thống AI hiện có.

---

## 🚨 MERGE CONFLICT WARNING — ĐỌC TRƯỚC KHI CODE 🚨

> ### ⛔ CẢNH BÁO TUYỆT ĐỐI DÀNH CHO JUNIOR AI CODER ⛔
>
> **KHÔNG ĐƯỢC PHÉP** viết các comment dạng placeholder như:
> - `// ... existing code ...`
> - `// (giữ nguyên logic cũ)`
> - `// các hàm khác giữ nguyên`
> - `/* rest of the file unchanged */`
>
> **ĐẶC BIỆT NGHIÊM TRỌNG** đối với các file chứa **State Machine / AI logic**:
>
> | File | Logic KHÔNG ĐƯỢC XÓA |
> |---|---|
> | `StaffManager.ts` | `RestockSubState` (IDLE → SEARCH_BOX → MOVE_TO_BOX → PICKUP_BOX → SEARCH_SHELF → MOVE_TO_SHELF → RESTOCKING → RETURN_BOX → DISPOSE_BOX), toàn bộ switch-case trong `update()`, `moveToTarget()`, `syncWorkers()`, các tham chiếu tới `deliveryManager` và `environmentManager`. |
> | `NPCManager.ts` | `handleNPCState()` dispatcher, toàn bộ 10 state (SPAWN, WANDER, WANT_TO_PLAY, SEEK_TABLE, PLAYING, SEEK_ITEM, INTERACT, GO_CASHIER, WAITING, LEAVE), `handleStuckRecovery()`, `boredomThreshold`, logic `isClosingTime`. |
> | `DeliveryManager.ts` | Logic Zoning với `EnvironmentManager.deliveryZone`, `isBeingCarried`, `carriedBy`, vòng lặp spawn box, cơ chế physics group bouncing. |
> | `EnvironmentManager.ts` | `computeExteriorZones()` (delivery / warp gate / idle staff zone), `refreshEnvironment()`, `updatePhysicalWalls()`, các ref `shopBounds`, `doorLocation`. |
> | `FurnitureManager.ts` | `shelvesGroup`, `tablesGroup`, `cashierGroup` (StaticGroup), `updateFurnitureVisuals()`, map `shelfTexts`, logic split `role: 'selling' | 'storage'`. |
>
> **NGUYÊN TẮC VÀNG:** Mỗi khi sửa 1 hàm, bạn phải **chép toàn bộ hàm đó** — từ dòng `private/public xxx() {` đầu tiên đến `}` cuối — vào PR. Nếu bạn thấy mình đang gõ dấu `...`, **DỪNG LẠI** và đọc lại quy tắc này.
>
> Nếu làm sai: game sẽ **crash ngay khi spawn NPC**, hoặc Staff sẽ **đứng im không restock**, hoặc box sẽ **không rơi xuống bãi Delivery**.

---

## Mục lục

1. [Triết lý 2.5D & 5 Quy tắc Sống còn](#1-triết-lý-25d--5-quy-tắc-sống-còn)
2. [Asset Pipeline & Texture Keys](#2-asset-pipeline--texture-keys)
3. [Preloader — Load Assets đúng chuẩn 2.5D](#3-preloader--load-assets-đúng-chuẩn-25d)
4. [Kỹ thuật Y-Sorting & Origin (Foot Anchor)](#4-kỹ-thuật-y-sorting--origin-foot-anchor)
5. [Kỹ thuật Hitbox Chân đế (Foot Collider)](#5-kỹ-thuật-hitbox-chân-đế-foot-collider)
6. [Cập nhật Player (MainScene)](#6-cập-nhật-player-mainscene)
7. [Cập nhật NPCManager](#7-cập-nhật-npcmanager)
8. [Cập nhật StaffManager](#8-cập-nhật-staffmanager)
9. [Cập nhật FurnitureManager](#9-cập-nhật-furnituremanager)
10. [Cập nhật DeliveryManager](#10-cập-nhật-deliverymanager)
11. [Cập nhật EnvironmentManager (Tường & Sàn 2.5D)](#11-cập-nhật-environmentmanager-tường--sàn-25d)
12. [Cập nhật DEPTH Config](#12-cập-nhật-depth-config)
13. [Checklist QA cuối cùng](#13-checklist-qa-cuối-cùng)

---

## 1. Triết lý 2.5D & 5 Quy tắc Sống còn

Trong 2D thuần, sprite chỉ cần vẽ theo thứ tự load. Trong **2.5D Orthogonal Top-Down**, ta giả lập chiều sâu bằng 5 quy tắc:

| # | Quy tắc | Ý nghĩa |
|---|---|---|
| **R1** | **Foot Anchor** — `setOrigin(0.5, 1)` | Mọi entity (Player, NPC, Staff, Furniture, Box) đều có **gốc toạ độ nằm ở giữa-đáy** sprite. Tọa độ `(x, y)` chính là **vị trí bàn chân**. |
| **R2** | **Y-Sort** — `setDepth(sprite.y)` | Vật nào có `y` lớn hơn (đứng gần camera hơn) sẽ **đè lên** vật có `y` nhỏ hơn. Cập nhật **mỗi frame** cho entity động, **1 lần khi spawn** cho entity tĩnh. |
| **R3** | **Foot Collider** — `body.setSize(w, h*0.3).setOffset(...)` | Physics body **chỉ chiếm 1/3 chiều cao sprite ở phần đáy**. Nhân vật có thể đi vòng ra **sau** kệ mà phần thân trên vẫn bị kệ **che khuất**. |
| **R4** | **Directional Anim** — `vx/vy` → `down/up/left/right` | Chọn animation theo **trục có vận tốc lớn hơn**, ưu tiên trục ngang khi `|vx| > |vy|`. |
| **R5** | **Transparent Floor** — Tile-based floor | Sàn là layer depth thấp nhất, không bao giờ vượt quá `DEPTH.FLOOR`. Tường có depth riêng và có thể **che nhân vật** khi nhân vật đi sát mép trên. |

> 💡 **Nếu bạn chỉ nhớ 1 điều duy nhất:** tất cả sprite đều `setOrigin(0.5, 1)` và `setDepth(y)`. Tất cả còn lại chỉ là chi tiết hoá 2 dòng này.

---

## 2. Asset Pipeline & Texture Keys

### 2.1 Bảng Texture Keys Chuẩn

Để tránh magic string rải rác khắp code, tạo file cấu hình mới:

**File mới:** `src/features/environment/assetKeys.ts`

```ts
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

  // ----- Delivery -----
  BOX_ITEM: 'box_item',

  // ----- Environment -----
  FLOOR_TILE: 'floor_tile',      // 32x32 seamless
  WALL_TOP: 'wall_top',          // 32x48 (phần có chiều cao)
  WALL_SIDE: 'wall_side',        // 32x32 (phần thấp)
  SIDEWALK_TILE: 'sidewalk_tile' // 32x32
} as const

export type TextureKey = typeof TEX[keyof typeof TEX]
```

### 2.2 Quy cách Asset (dành cho Artist / AI tạo ảnh)

| Asset | Kích thước | Origin | Ghi chú |
|---|---|---|---|
| `player_sheet.png` | **32×48 per frame**, 4 hàng × 4 cột | (0.5, 1) — giữa-đáy | Hàng 0: DOWN, Hàng 1: LEFT, Hàng 2: RIGHT, Hàng 3: UP. Mỗi hàng 4 frame walk-cycle. |
| `npc_sheet.png` | 32×48 per frame, 4×4 | (0.5, 1) | Palette khác Player. Layout frame **giống hệt** Player. |
| `staff_sheet.png` | 32×48 per frame, 4×4 | (0.5, 1) | Nhân viên mặc đồng phục (apron). Layout giống Player. |
| `shelf_selling.png` | 64×96 | (0.5, 1) | Kệ trưng bày — gỗ sáng. Phần đáy (32px dưới cùng) là "chân đế" — đây là vùng collider. |
| `shelf_storage.png` | 64×96 | (0.5, 1) | Kệ kho công nghiệp — kim loại xám. |
| `cashier_desk.png` | 96×72 | (0.5, 1) | Quầy thu ngân. |
| `play_table.png` | 80×64 | (0.5, 1) | Bàn chơi bài. |
| `box_item.png` | 32×32 | (0.5, 1) | Thùng hàng vuông, origin đáy. |
| `floor_tile.png` | 32×32 | (0, 0) | Tileable. Dùng với `TileSprite`. |
| `wall_top.png` | 32×48 | (0, 0) | Tường có "độ cao" — phần trên sprite nhô lên 16px để che nhân vật. |

> **Quy tắc 1/3 đáy:** Với shelf (96px cao), `height * 0.3 ≈ 29px` → collider chiếm 29px dưới cùng. Nhân vật đi vào 67px trên cùng sẽ lướt qua tự do, đồng thời bị kệ che khuất nhờ Y-sort.

---

## 3. Preloader — Load Assets đúng chuẩn 2.5D

Hiện tại `MainScene.preload()` đang load trực tiếp. Ta giữ pattern này (không cần tách scene Preloader riêng) **nhưng refactor** để dùng `TEX` constant và load đầy đủ các asset mới.

**File sửa:** `src/game/MainScene.ts` — hàm `preload()`

```ts
// ===== IMPORT ASSETS (thêm vào đầu file, bên cạnh các import cũ) =====
import playerSheet from '../assets/images/player_sheet.png'
import npcSheet from '../assets/images/npc_sheet.png'
import staffSheet from '../assets/images/staff_sheet.png'
import shelfSellingImg from '../assets/images/shelf_selling.png'
import shelfStorageImg from '../assets/images/shelf_storage.png'
import cashierDeskImg from '../assets/images/cashier_desk.png'
import playTableImg from '../assets/images/play_table.png'
import boxItemImg from '../assets/images/box_item.png'
import floorTileImg from '../assets/images/floor_tile.png'
import wallTopImg from '../assets/images/wall_top.png'
import wallSideImg from '../assets/images/wall_side.png'
import sidewalkTileImg from '../assets/images/sidewalk_tile.png'
import gymBuildingImg from '../assets/images/gym_building.svg'
import { TEX } from '../features/environment/assetKeys'

/**
 * Tải toàn bộ tài nguyên đồ họa 2.5D.
 * 
 * QUY TẮC:
 * - Spritesheet: 32x48 per frame, layout 4 cột x 4 hàng (DOWN/LEFT/RIGHT/UP).
 * - Image furniture: origin sẽ được setOrigin(0.5, 1) khi instantiate.
 * - TẤT CẢ key phải đi qua TEX constant, không hardcode.
 */
preload() {
  // --- Characters (spritesheets) ---
  this.load.spritesheet(TEX.PLAYER, playerSheet, { frameWidth: 32, frameHeight: 48 })
  this.load.spritesheet(TEX.NPC,    npcSheet,    { frameWidth: 32, frameHeight: 48 })
  this.load.spritesheet(TEX.STAFF,  staffSheet,  { frameWidth: 32, frameHeight: 48 })

  // --- Furniture (single images) ---
  this.load.image(TEX.SHELF_SELLING, shelfSellingImg)
  this.load.image(TEX.SHELF_STORAGE, shelfStorageImg)
  this.load.image(TEX.CASHIER_DESK,  cashierDeskImg)
  this.load.image(TEX.PLAY_TABLE,    playTableImg)

  // --- Delivery ---
  this.load.image(TEX.BOX_ITEM, boxItemImg)

  // --- Environment tiles ---
  this.load.image(TEX.FLOOR_TILE,    floorTileImg)
  this.load.image(TEX.WALL_TOP,      wallTopImg)
  this.load.image(TEX.WALL_SIDE,     wallSideImg)
  this.load.image(TEX.SIDEWALK_TILE, sidewalkTileImg)

  // --- Legacy (giữ lại để không phá Town/Gym) ---
  this.load.image('gym_building', gymBuildingImg)
}
```

### 3.1 Đăng ký Animation 4 hướng (trong `create()`)

Đây là phần **PHẢI THÊM** vào đầu hàm `create()`, trước khi khởi tạo các Manager. Animation được đăng ký vào `anims` **toàn cục của scene**, nên cả Player / NPC / Staff đều dùng chung hệ naming.

```ts
/**
 * Đăng ký animation 4 hướng cho tất cả entity dùng spritesheet 4x4.
 * Naming convention: `<prefix>-<direction>`, ví dụ: 'player-down', 'npc-left', 'staff-up'.
 * 
 * Hàng 0 = DOWN (frame 0-3)
 * Hàng 1 = LEFT (frame 4-7)
 * Hàng 2 = RIGHT (frame 8-11)
 * Hàng 3 = UP   (frame 12-15)
 */
private registerCharacterAnimations() {
  const defs: Array<{ prefix: string, key: string }> = [
    { prefix: 'player', key: TEX.PLAYER },
    { prefix: 'npc',    key: TEX.NPC },
    { prefix: 'staff',  key: TEX.STAFF }
  ]

  const dirRows: Array<{ dir: string, start: number }> = [
    { dir: 'down',  start: 0 },
    { dir: 'left',  start: 4 },
    { dir: 'right', start: 8 },
    { dir: 'up',    start: 12 }
  ]

  for (const { prefix, key } of defs) {
    for (const { dir, start } of dirRows) {
      const animKey = `${prefix}-${dir}`
      if (this.anims.exists(animKey)) continue // Idempotent — tránh re-register khi scene restart
      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(key, { start, end: start + 3 }),
        frameRate: 8,
        repeat: -1
      })
    }
  }
}
```

Gọi hàm này **ngay đầu `create()`**, trước bất kỳ `new XxxManager()` nào:

```ts
create() {
  const gameStore = useGameStore()

  // 🆕 BẮT BUỘC — đăng ký anims TRƯỚC khi spawn bất kỳ entity nào
  this.registerCharacterAnimations()

  // 1. Khởi tạo Layers đồ họa trước để các Managers có thể vẽ lên
  this.previewGraphics = this.add.graphics().setDepth(DEPTH.PREVIEW)
  // ... giữ nguyên phần còn lại của create() ...
}
```

---

## 4. Kỹ thuật Y-Sorting & Origin (Foot Anchor)

### 4.1 Helper tập trung — `ySortUtils.ts`

Thay vì rải rác `setDepth(sprite.y)` khắp nơi, ta tạo helper để Junior không quên áp dụng đúng.

**File mới:** `src/features/environment/ySortUtils.ts`

```ts
import Phaser from 'phaser'

/**
 * Áp dụng quy tắc 2.5D cho entity ĐỘNG (Player, NPC, Staff, Box đang được carry).
 * - Origin giữa-đáy để (x, y) = tọa độ bàn chân.
 * - Depth = y → vật dưới đè vật trên.
 * 
 * Gọi MỖI FRAME trong vòng update của Manager tương ứng.
 */
export function applyDynamicYSort(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite) {
  // Origin có thể đã set ở spawn, nhưng gọi lại cũng không tốn gì (idempotent).
  sprite.setOrigin(0.5, 1)
  sprite.setDepth(sprite.y)
}

/**
 * Áp dụng quy tắc 2.5D cho entity TĨNH (Furniture, Wall, Box đã đặt xuống đất).
 * - Set origin giữa-đáy.
 * - Depth = y (chỉ tính 1 lần khi spawn, vì vật không di chuyển).
 * 
 * Gọi DUY NHẤT 1 LẦN tại thời điểm spawn / refresh furniture.
 */
export function applyStaticYSort(
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
) {
  sprite.setOrigin(0.5, 1)
  sprite.setDepth(sprite.y)
}

/**
 * Áp dụng hitbox "chân đế" — chỉ 1/3 phần đáy của sprite là vùng va chạm.
 * 
 * @param sprite Physics sprite cần set hitbox
 * @param footRatio Tỉ lệ chiều cao của hitbox so với sprite (mặc định 0.3 = 30%)
 * 
 * Công thức:
 *   - bodyWidth  = displayWidth * 0.8  (thu hẹp 20% mỗi bên cho thoáng)
 *   - bodyHeight = displayHeight * footRatio
 *   - offsetX    = (displayWidth - bodyWidth) / 2          (căn giữa theo X)
 *   - offsetY    = displayHeight - bodyHeight              (dán xuống đáy)
 * 
 * Lưu ý: setOffset() nhận tọa độ TEXTURE (không phải display), nên phải chia cho scale nếu có.
 */
export function applyFootCollider(
  sprite: Phaser.Physics.Arcade.Sprite,
  footRatio: number = 0.3
) {
  const body = sprite.body as Phaser.Physics.Arcade.Body
  if (!body) return

  // Kích thước sprite HIỂN THỊ (đã áp scale)
  const dispW = sprite.displayWidth
  const dispH = sprite.displayHeight
  const scaleX = sprite.scaleX || 1
  const scaleY = sprite.scaleY || 1

  // Kích thước hitbox mong muốn (theo display)
  const bodyW = dispW * 0.8
  const bodyH = dispH * footRatio

  // setSize() nhận đơn vị TEXTURE → chia lại cho scale
  body.setSize(bodyW / scaleX, bodyH / scaleY)

  // setOffset() cũng theo đơn vị TEXTURE
  const offsetX = ((dispW - bodyW) / 2) / scaleX
  const offsetY = (dispH - bodyH) / scaleY
  body.setOffset(offsetX, offsetY)
}
```

> 🧠 **Tại sao không dùng `scene.events.on('update', ...)` toàn cục để Y-sort?**  
> Vì Phaser không cho phép easy-access tới tất cả sprite trong scene. Mỗi Manager đã có vòng `update()` iterate qua entity của nó — gọi `applyDynamicYSort(sprite)` trong đó rẻ hơn nhiều so với scan toàn bộ scene.

### 4.2 Quy tắc Origin cho Furniture Group

`StaticGroup.create()` mặc định origin là `(0.5, 0.5)`. Khi spawn furniture, ta **phải gọi setOrigin(0.5, 1)** ngay sau đó, **rồi mới** `refreshBody()` để physics body đồng bộ lại.

```ts
const sprite = this.shelvesGroup.create(shelf.x, shelf.y, TEX.SHELF_SELLING) as Phaser.Physics.Arcade.Sprite
sprite.setOrigin(0.5, 1)  // ← BẮT BUỘC trước refreshBody
applyFootCollider(sprite, 0.3)
sprite.refreshBody()      // ← Đồng bộ lại StaticBody với body size/offset mới
```

---

## 5. Kỹ thuật Hitbox Chân đế (Foot Collider)

### 5.1 Minh hoạ bằng ASCII

Giả sử shelf sprite 64×96 (width × height):

```
  ┌─────────┐  ← y - 96 (đỉnh sprite)
  │         │
  │ PHẦN 2/3│   ← Phần ảo, nhân vật đi xuyên qua được.
  │  TRÊN   │     Nhưng bị SHELF CHE KHUẤT vì shelf.y > nhân vật.y
  │ (no box)│
  │         │
  ├─────────┤  ← y - 29 (bắt đầu body)
  │░░░BODY░░│
  │░░COLLIDE│   ← 29px = 96 * 0.3 — physics body THẬT SỰ
  │░░░R░░░░░│     Nhân vật đâm vào đây sẽ bị chặn.
  └─────────┘  ← y (origin 0.5, 1 — toạ độ chân shelf)
```

### 5.2 Công thức cho từng loại entity

| Entity | `footRatio` | Lý do |
|---|---|---|
| **Player / NPC / Staff** (32×48) | `0.3` → body 32×14 | Nhân vật có thân trên khá cao, chân chỉ chiếm ~30%. |
| **Shelf** (64×96) | `0.3` → body 51×29 | Chỉ phần chân kệ chặn va chạm, thân trên che hình. |
| **Cashier Desk** (96×72) | `0.6` → body 77×43 | Desk thấp và dày, hitbox chiếm 60% để không "đi xuyên". |
| **Play Table** (80×64) | `0.7` → body 64×45 | Bàn gần như phẳng, hitbox gần toàn bộ. |
| **Box (Delivery)** (32×32) | `1.0` → body 32×32 | Box là khối vuông, không có "phần ảo". |
| **Wall Top** (tường có độ cao) | `0.4` → body chiếm 40% đáy | Phần trên là "mái" tường, nhân vật lướt qua phía sau. |

### 5.3 Cảnh báo khi entity có `setScale()` khác 1

Nếu bạn `sprite.setScale(1.2, 1.0)` (trường hợp shelf_double đang dùng), helper `applyFootCollider` đã tự chia scale ra. **Không cần sửa gì**. Nhưng bạn **PHẢI GỌI** `applyFootCollider` **SAU** `setScale()`, không được ngược lại:

```ts
// ❌ SAI — collider sẽ bị scale sai
applyFootCollider(sprite, 0.3)
sprite.setScale(1.2, 1.0)

// ✅ ĐÚNG
sprite.setScale(1.2, 1.0)
applyFootCollider(sprite, 0.3)
sprite.refreshBody()
```

---

## 6. Cập nhật Player (MainScene)

### 6.1 Thay đổi trong `create()` — phần spawn Player

Tìm đoạn tạo `this.player` trong `MainScene.create()` và thay toàn bộ thành:

```ts
// ==================== SPAWN PLAYER (2.5D) ====================
import { TEX } from '../features/environment/assetKeys'
import { applyDynamicYSort, applyFootCollider } from '../features/environment/ySortUtils'
// (Đặt 2 import này ở đầu file nếu chưa có)

const doorLoc = this.environmentManager.getDoorLocation()
this.player = this.physics.add.sprite(doorLoc.x, doorLoc.y - 50, TEX.PLAYER, 0)

// R1: Foot Anchor — origin giữa-đáy
this.player.setOrigin(0.5, 1)

// R3: Foot Collider — hitbox chỉ 30% phần đáy
applyFootCollider(this.player, 0.3)

// Physics cơ bản
this.player.setCollideWorldBounds(true)

// Ban đầu depth = y để Y-sort ngay lập tức (cập nhật liên tục trong update)
this.player.setDepth(this.player.y)

// Animation mặc định — đứng quay xuống
this.player.anims.play('player-down', true)
this.player.anims.stop() // Đứng im ở frame 0
```

### 6.2 Thay thế `handlePlayerMovement()` hiện có

**XOÁ TOÀN BỘ** hàm `handlePlayerMovement()` cũ và thay bằng bản mới dưới đây. **KHÔNG ĐƯỢC để placeholder** — chép nguyên xi:

```ts
/**
 * Xử lý di chuyển vật lý của Player (2.5D).
 * 
 * Thay đổi so với phiên bản cũ:
 * - Chọn animation 4 hướng theo trục vận tốc LỚN HƠN (R4).
 * - Idle = dừng anim ở frame đầu tiên của hướng hiện tại (không phải stop trắng).
 * - Y-sort được update ở cuối update() — không gọi ở đây.
 */
private handlePlayerMovement() {
  this.player.setVelocity(0)
  const speed = 160
  let isMoving = false

  // --- X axis ---
  if (this.cursors.left.isDown) {
    this.player.setVelocityX(-speed)
    isMoving = true
  } else if (this.cursors.right.isDown) {
    this.player.setVelocityX(speed)
    isMoving = true
  }

  // --- Y axis ---
  if (this.cursors.up.isDown) {
    this.player.setVelocityY(-speed)
    isMoving = true
  } else if (this.cursors.down.isDown) {
    this.player.setVelocityY(speed)
    isMoving = true
  }

  // Chuẩn hoá vector đường chéo để không đi nhanh gấp √2
  if (isMoving) {
    this.player.body!.velocity.normalize().scale(speed)

    // R4: Chọn hướng animation theo trục lớn hơn
    const vx = this.player.body!.velocity.x
    const vy = this.player.body!.velocity.y

    if (Math.abs(vx) > Math.abs(vy)) {
      this.player.anims.play(vx < 0 ? 'player-left' : 'player-right', true)
    } else {
      this.player.anims.play(vy < 0 ? 'player-up' : 'player-down', true)
    }
  } else {
    // Idle — giữ nguyên hướng mặt, chỉ dừng cycle tại frame hiện tại
    if (this.player.anims.isPlaying) {
      this.player.anims.stop()
    }
  }
}
```

### 6.3 Thêm 1 dòng Y-sort vào cuối `update()`

Trong hàm `update(time, _delta)` của `MainScene`, **SAU** block `if (!store.isBuildMode && !store.isEditMode) { ... }`, thêm dòng sau:

```ts
// 🆕 R2: Y-Sort cho Player mỗi frame
applyDynamicYSort(this.player)
```

> Staff sprite map (`this.staffSprites`) và NPC sprites sẽ được Y-sort **bên trong** các Manager tương ứng, không cần làm ở đây.

---

## 7. Cập nhật NPCManager

Mục tiêu: **KHÔNG động đến State Machine**, chỉ đổi visual spawn và thêm Y-sort.

### 7.1 Sửa `spawnNPC()` — Chép toàn bộ hàm

**XOÁ** hàm `spawnNPC()` hiện tại và thay bằng:

```ts
// Thêm imports ở đầu file NPCManager.ts (nếu chưa có)
import { TEX } from '../../environment/assetKeys'
import { applyDynamicYSort, applyFootCollider } from '../../environment/ySortUtils'

/**
 * Tạo một NPC mới tại cửa Shop với các ý định (Intent) ngẫu nhiên.
 * 
 * Phiên bản 2.5D:
 * - Dùng TEX.NPC (spritesheet 32x48).
 * - setOrigin(0.5, 1) → tọa độ (x, y) = tọa độ chân.
 * - Foot collider 30%.
 * 
 * ⚠️ KHÔNG XOÁ: intent logic, instanceId, statusText, customers.push, timer.
 */
public spawnNPC() {
  const gameStore = useGameStore()
  
  // Kiểm tra điều kiện Shop: không spawn nếu đóng hoặc quá giờ làm việc (20:00)
  if (gameStore.shopState !== 'OPEN' || gameStore.timeInMinutes >= 1200) return
  if (this.customers.length >= 15) return

  const doorLocation = this.environmentManager.getDoorLocation()

  // --- 2.5D SPRITE SETUP ---
  const npcSprite = this.scene.physics.add.sprite(
    doorLocation.x,
    doorLocation.y + 50,
    TEX.NPC,
    0 // Frame đầu tiên (down-idle)
  )
  npcSprite.setOrigin(0.5, 1)              // R1 — foot anchor
  applyFootCollider(npcSprite, 0.3)        // R3 — chỉ 30% đáy là collider
  npcSprite.setCollideWorldBounds(true)
  npcSprite.setDepth(npcSprite.y)          // R2 — ban đầu y-sort (sẽ update mỗi frame)

  // Quyết định mục đích: 30% khách đến để đánh bài, 70% đến để mua hàng
  const isPlayer = Math.random() < 0.3

  const instanceId = `npc_${Date.now()}_${Math.floor(Math.random() * 1000)}`
  const newCust: Customer = {
    sprite: npcSprite,
    state: 'SPAWN' as NPCState,
    timer: this.scene.time.now + 500,
    targetX: doorLocation.x,
    targetY: doorLocation.y - 40,
    targetPrice: 0,
    intent: isPlayer ? 'PLAY' : 'BUY',
    spawnTime: this.scene.time.now,
    lastDecisionTime: this.scene.time.now,
    lastMoveAttemptTime: this.scene.time.now,
    instanceId,
    checkedShelfIds: [],
    searchStartTime: this.scene.time.now
  }

  // Tạo Text hiển thị trạng thái trên đầu NPC (Overhead Label)
  newCust.statusText = this.scene.add.text(npcSprite.x, npcSprite.y - 55, '...', {
    fontSize: '10px',
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: { x: 4, y: 2 }
  }).setOrigin(0.5).setDepth(DEPTH.UI_TEXT).setVisible(true)

  this.customers.push(newCust)
}
```

> 📝 **Thay đổi duy nhất so với bản cũ:**
> 1. Dùng `TEX.NPC` thay vì `'npc'`.
> 2. Thêm `setOrigin(0.5, 1)` + `applyFootCollider`.
> 3. `statusText` đặt cao hơn một chút (`y - 55` thay vì `y - 35`) vì sprite giờ cao 48px và neo ở đáy — nếu để `y - 35` sẽ chèn vào giữa đầu NPC.

### 7.2 Sửa `updateNPCAnimation()` — Thêm Y-Sort

Thay toàn bộ hàm `updateNPCAnimation()` bằng:

```ts
/**
 * Xử lý hướng Animation + Y-Sort cho NPC mỗi frame.
 * 
 * ⚠️ CHÚ Ý:
 * - Giữ nguyên logic "trục lớn hơn" để chọn hướng (R4).
 * - THÊM MỚI: applyDynamicYSort mỗi frame để NPC đúng order 2.5D.
 */
private updateNPCAnimation(customer: Customer) {
  const sprite = customer.sprite

  // Y-SORT (R2) — BẮT BUỘC mỗi frame, TRƯỚC khi chọn anim
  applyDynamicYSort(sprite)

  if (sprite.body && sprite.body.velocity.lengthSq() > 0) {
    const vx = sprite.body.velocity.x
    const vy = sprite.body.velocity.y
    if (Math.abs(vx) > Math.abs(vy)) {
      sprite.anims.play(vx < 0 ? 'npc-left' : 'npc-right', true)
    } else {
      sprite.anims.play(vy < 0 ? 'npc-up' : 'npc-down', true)
    }
  } else {
    if (sprite.anims.isPlaying) sprite.anims.stop()
  }
}
```

### 7.3 Sửa `updateStatusText()` — Offset đúng chiều cao sprite

Trong hàm `updateStatusText()`, dòng đầu tiên:

```ts
// CŨ: customer.statusText.setPosition(customer.sprite.x, customer.sprite.y - 35)
// MỚI:
customer.statusText.setPosition(customer.sprite.x, customer.sprite.y - 55)
```

Lý do: sprite giờ cao 48px, origin ở đáy, nên đỉnh đầu ở `y - 48`. Đặt text cách đỉnh đầu 7px → `y - 55`.

> **KHÔNG ĐƯỢC** sửa gì khác trong `NPCManager.ts`. `handleNPCState`, `handleStuckRecovery`, tất cả các `handleXxx()` state handler **giữ nguyên 100%**.

---

## 8. Cập nhật StaffManager

**QUY TẮC TỐI THƯỢỢNG:** Không được chạm vào `RestockSubState`, không được sửa `update()`, `syncWorkers()`, `moveToTarget()`, các hàm xử lý Delivery/Restock. Chỉ sửa **2 chỗ duy nhất**:

### 8.1 Sửa phần spawn Worker trong `syncWorkers()`

Tìm đoạn tạo sprite worker trong `syncWorkers()` (chỗ có `this.scene.physics.add.sprite(...)` và push vào `this.workers.set(...)`). Thay đoạn tạo sprite (CHỈ đoạn tạo sprite, không động vào logic Map) bằng:

```ts
// Thêm imports đầu file StaffManager.ts
import { TEX } from '../../environment/assetKeys'
import { applyDynamicYSort, applyFootCollider } from '../../environment/ySortUtils'

// ... bên trong syncWorkers(), khi tạo sprite cho worker mới:

const spawnLoc = this.environmentManager.idleStaffZone
const sprite = this.scene.physics.add.sprite(
  spawnLoc.x,
  spawnLoc.y,
  TEX.STAFF,   // ← Đổi từ 'npc' sang TEX.STAFF (có uniform riêng)
  0
)
sprite.setOrigin(0.5, 1)             // R1
applyFootCollider(sprite, 0.3)       // R3
sprite.setCollideWorldBounds(true)
sprite.setDepth(sprite.y)            // R2 initial
```

> Phần còn lại của `syncWorkers()` (tạo statusText, khởi tạo WorkerNPC object, push vào Map) — **GIỮ NGUYÊN**. Bạn chỉ đụng vào 3 dòng sprite setup.

### 8.2 Sửa `updateVisuals()` — Chép toàn bộ hàm

**XOÁ** hàm `updateVisuals()` hiện tại, thay bằng:

```ts
/**
 * Cập nhật diện mạo của worker mỗi frame.
 * 
 * ⚠️ CHÚ Ý SỐNG CÒN:
 * - KHÔNG động đến logic subState / duty / workerData.
 * - THÊM MỚI: applyDynamicYSort mỗi frame.
 * - Animation dùng prefix 'staff-' (nếu staff_sheet giống layout npc thì vẫn có thể dùng 'npc-',
 *   nhưng tách namespace để sau này artist phân biệt rõ).
 */
private updateVisuals(worker: WorkerNPC) {
  // R2: Y-SORT — BẮT BUỘC trước mọi thao tác khác
  applyDynamicYSort(worker.sprite)

  // Label vị trí — offset đúng chiều cao sprite 48px
  worker.statusText.setPosition(worker.sprite.x, worker.sprite.y - 55)

  let label = ''
  if (worker.duty === 'CHECKOUT') {
    label = 'Checkout'
  } else if (worker.duty === 'RESTOCK') {
    label = `Restock: ${worker.subState}`
  } else {
    label = 'Resting'
  }
  worker.statusText.setText(label)

  const anims = worker.sprite.anims
  const vx = worker.sprite.body?.velocity.x || 0
  const vy = worker.sprite.body?.velocity.y || 0

  // R4: Chọn anim theo trục lớn hơn
  if (Math.abs(vx) > Math.abs(vy)) {
    if (vx < -10)      anims.play('staff-left', true)
    else if (vx > 10)  anims.play('staff-right', true)
  } else {
    if (vy < -10)      anims.play('staff-up', true)
    else if (vy > 10)  anims.play('staff-down', true)
  }

  if (Math.abs(vx) < 10 && Math.abs(vy) < 10) {
    if (anims.isPlaying) anims.stop()
  }
}
```

> 🛡️ **ĐỪNG** vô tình sửa các hàm khác trong `StaffManager.ts`. Mọi hàm `handleXxx`, `pickupBox`, `returnBox`, `searchBox`, v.v. phải **y nguyên byte-for-byte**. Nếu IDE tự format khiến diff có thay đổi ở các hàm đó, revert lại.

---

## 9. Cập nhật FurnitureManager

### 9.1 Sửa `displayShelf()` — Chép toàn bộ hàm

**XOÁ** hàm `displayShelf()` cũ, thay bằng:

```ts
// Thêm imports đầu file FurnitureManager.ts
import { TEX } from '../../environment/assetKeys'
import { applyFootCollider, applyStaticYSort } from '../../environment/ySortUtils'

/**
 * Hiển thị một shelf (Selling hoặc Storage) ở không gian 2.5D.
 * 
 * ⚠️ GIỮ NGUYÊN:
 * - isDouble logic (shelf_double → tint + scale).
 * - shelfTexts map để update info text.
 * - shelf.role split selling/storage.
 */
public displayShelf(shelf: ShelfData) {
  const isDouble  = shelf.furnitureId === 'shelf_double'
  const isStorage = shelf.role === 'storage'
  const textureKey = isStorage ? TEX.SHELF_STORAGE : TEX.SHELF_SELLING

  // Tạo sprite trong static group
  const sprite = this.shelvesGroup.create(shelf.x, shelf.y, textureKey) as Phaser.Physics.Arcade.Sprite
  sprite.setData('id', shelf.id)
  sprite.setData('type', 'shelf')

  // R1: Foot Anchor — TRƯỚC setScale, TRƯỚC refreshBody
  sprite.setOrigin(0.5, 1)

  // Áp dụng scale đặc biệt cho các biến thể (GIỮ NGUYÊN LOGIC CŨ)
  if (isDouble) {
    sprite.setTint(0x8B4513)
    sprite.setScale(1.2, 1.0)
  } else if (isStorage && shelf.furnitureId === 'warehouse_shelf') {
    sprite.setScale(1.1, 1.1)
  }

  // R3: Foot Collider — chỉ 30% đáy là physical body
  applyFootCollider(sprite, 0.3)

  // Sau khi sửa origin + scale + body, BẮT BUỘC refreshBody để StaticBody đồng bộ.
  sprite.refreshBody()

  // R2: Static Y-Sort — 1 lần duy nhất khi spawn.
  applyStaticYSort(sprite)

  // Label thông tin shelf — đặt trên đỉnh sprite (sprite cao 96px, origin đáy → đỉnh = y - 96)
  const text = this.scene.add.text(shelf.x, shelf.y - 100, this.getShelfInfo(shelf), {
    fontSize: '11px',
    fontStyle: 'bold',
    color: isDouble ? '#ffeb3b' : '#000',
    backgroundColor: isDouble ? '#212121' : '#fff',
    padding: { x: 4, y: 2 }
  }).setOrigin(0.5).setDepth(DEPTH.UI)

  this.shelfTexts[shelf.id] = text
}
```

### 9.2 Sửa `displayCashier()` và `displayTable()`

Áp dụng cùng pattern (không chép lại toàn bộ hàm ở đây vì bản gốc đã cắt ngắn, nhưng Junior phải:

1. Mở `displayTable()` / `displayCashier()`.
2. **Trước** khi `create()` sprite vào group: giữ nguyên tính toán w/h.
3. **Sau** `create()`: gọi theo thứ tự:
   ```ts
   sprite.setOrigin(0.5, 1)
   applyFootCollider(sprite, 0.6)  // Cashier
   // hoặc
   applyFootCollider(sprite, 0.7)  // Play table
   sprite.refreshBody()
   applyStaticYSort(sprite)
   ```
4. **Đổi texture key**:
   - Cashier: `TEX.CASHIER_DESK`
   - Play Table: `TEX.PLAY_TABLE`
5. **Label text offset**: lấy theo `sprite.displayHeight` — ví dụ cashier 72px → label ở `y - 75`.

### 9.3 Sửa `updateFurnitureVisuals()`

Hàm này được gọi mỗi frame. **KHÔNG** thêm `applyDynamicYSort` ở đây, vì furniture là static — đã Y-sort 1 lần khi spawn là đủ. **Chỉ** cập nhật text label và các indicator cần refresh (`getShelfInfo()`, v.v.).

Giữ nguyên hoàn toàn logic `updateFurnitureVisuals()` hiện tại.

---

## 10. Cập nhật DeliveryManager

### 10.1 Đổi box từ Rectangle sang Sprite

Tìm vòng spawn box (chỗ tạo `Phaser.GameObjects.Rectangle`), thay bằng sprite. Cấu trúc `LiveBox` cần đổi type:

```ts
// ⚠️ File: DeliveryManager.ts
// THAY ĐỔI interface LiveBox

import { TEX } from '../../environment/assetKeys'
import { applyDynamicYSort, applyFootCollider } from '../../environment/ySortUtils'

interface LiveBox {
  id: string
  sprite: Phaser.Physics.Arcade.Sprite   // ← ĐỔI từ Rectangle sang Sprite
  label: Phaser.GameObjects.Text
  qtyLabel: Phaser.GameObjects.Text
  itemId: string
  type: string
  quantity: number
  name: string
  isBeingCarried: boolean
  carriedBy: 'player' | 'staff' | null
}
```

### 10.2 Spawn Box — Code mẫu

Chỗ trong `DeliveryManager` bạn đang tạo Rectangle cho box, thay thành:

```ts
// ==================== SPAWN BOX (2.5D) ====================
const dz = this.environmentManager.deliveryZone

// Rơi từ trên xuống — spawnY cao hơn zone để có hiệu ứng rơi
const spawnX = dz.x + Phaser.Math.Between(-dz.width / 2, dz.width / 2)
const spawnY = dz.y - 200

const boxSprite = this.scene.physics.add.sprite(spawnX, spawnY, TEX.BOX_ITEM)
boxSprite.setOrigin(0.5, 1)                // R1
applyFootCollider(boxSprite, 1.0)          // Box vuông → collider toàn bộ
boxSprite.setCollideWorldBounds(true)
boxSprite.setBounce(0.3)
boxSprite.setDepth(boxSprite.y)            // R2 initial

// Thêm vào physics group cũ để collide với delivery zone
this.boxGroup.add(boxSprite)

// Label giữ nguyên style, chỉ đổi offset
const label = this.scene.add.text(boxSprite.x, boxSprite.y - 40, box.name, { /* ... */ })
  .setOrigin(0.5).setDepth(DEPTH.UI_TEXT)
```

### 10.3 Update loop — Y-Sort khi box đang rơi và khi đang được carry

Trong hàm `DeliveryManager.update(time, playerX, playerY)`, thêm vòng:

```ts
/**
 * update() đã tồn tại — THÊM block này vào ĐẦU hàm (không xoá gì cũ).
 * Lý do: box đang rơi xuống, hoặc đang được NPC/Staff mang, đều cần Y-sort mỗi frame.
 */
update(time: number, playerX: number, playerY: number) {
  // 🆕 R2: Y-SORT cho mọi box động
  for (const box of this.boxes) {
    applyDynamicYSort(box.sprite)
    // Label đi theo sprite
    if (box.label) box.label.setPosition(box.sprite.x, box.sprite.y - 40)
    if (box.qtyLabel) box.qtyLabel.setPosition(box.sprite.x, box.sprite.y - 25)
  }

  // ... (phần logic cũ của update() — spawn, keyF pickup, hintText, v.v. — GIỮ NGUYÊN) ...
}
```

### 10.4 Khi box được carry (player/staff cầm lên)

Khi box được pickup, ta **parent** nó theo player/staff. Trong code hiện tại, bạn đang set vị trí box = vị trí carrier + offset. Chỉ cần đảm bảo mỗi frame `applyDynamicYSort(box.sprite)` được gọi (vòng lặp ở 10.3 đã làm việc này).

Tuy nhiên, carrier box thường nên có `depth = carrier.y + 1` để box **luôn vẽ trên** người mang nó. Thêm logic:

```ts
// Trong vòng for ở 10.3:
for (const box of this.boxes) {
  if (box.isBeingCarried) {
    // Box bám theo carrier và LUÔN vẽ trên carrier +1
    // (Giả sử bạn đã có biến `carrierSprite` tham chiếu đến Player hoặc Staff)
    // box.sprite.y đã được set bởi logic carry cũ — chỉ cần depth override:
    box.sprite.setDepth(box.sprite.y + 1)
  } else {
    applyDynamicYSort(box.sprite)
  }

  if (box.label)    box.label.setPosition(box.sprite.x, box.sprite.y - 40)
  if (box.qtyLabel) box.qtyLabel.setPosition(box.sprite.x, box.sprite.y - 25)
}
```

> **KHÔNG** chạm vào logic `keyF` pickup, `spawnInterval`, liên kết với `deliveryStore`. Đó là domain của DeliveryManager cũ.

---

## 11. Cập nhật EnvironmentManager (Tường & Sàn 2.5D)

Đây là phần thay đổi **lớn nhất về mặt visual**, nhưng **KHÔNG** đụng đến `computeExteriorZones()`, `updatePhysicalWalls()`, `shopBounds`. Chỉ thay phần *vẽ* từ `graphics.fillRect` sang `TileSprite` và `Image`.

### 11.1 Khái niệm — Tường 2.5D là gì?

Tường 2D phẳng trông như line vẽ. Tường 2.5D có **phần "cao"** nhô lên (thường 16-24px trên đỉnh) để:

- Khi nhân vật đi **sát mép trên** tường (phía sau), nhân vật bị **che bởi phần cao của tường**.
- Tạo cảm giác tường có **độ dày**, không phải chỉ là kẻ chì.

Cách thực hiện: dùng **2 loại tile**:
- `wall_side` (32×32): phần thấp, dùng cho cạnh trái/phải/dưới.
- `wall_top` (32×48): phần trên, có thêm 16px "mái" nhô lên — dùng cho cạnh trên của shop.

### 11.2 Sửa `refreshEnvironment()`

**TRONG** `refreshEnvironment()`, tìm block vẽ floor (`this.floorGraphics.fillStyle(0x2c3e50, 1)` và `fillRect`). Thay toàn bộ phần vẽ floor + wall bằng code sau, **nhưng GIỮ NGUYÊN** phần preview expansion ở cuối:

```ts
// Thêm imports đầu file EnvironmentManager.ts
import { TEX } from '../assetKeys'
import { DEPTH } from '../config'

// Khai báo thành viên mới trong class (thêm cùng các `floorGraphics`, `wallGraphics` hiện có):
private floorTileSprite!: Phaser.GameObjects.TileSprite
private wallTopSprite!: Phaser.GameObjects.TileSprite
private wallSideSprites: Phaser.GameObjects.TileSprite[] = []

// ... trong refreshEnvironment() ...

// ============ XOÁ phần vẽ floor cũ (graphics.fillStyle + fillRect + grid lineBetween) ============
// ============ THAY bằng block này: ============

const { x: startX, y: startY, w: shopW, h: shopH } = this.shopBounds

// 1. FLOOR — dùng TileSprite để lặp texture tự động
if (!this.floorTileSprite) {
  // Khởi tạo 1 lần duy nhất — origin (0,0) để dễ tính
  this.floorTileSprite = this.scene.add.tileSprite(startX, startY, shopW, shopH, TEX.FLOOR_TILE)
    .setOrigin(0, 0)
    .setDepth(DEPTH.FLOOR)
} else {
  // Refresh khi expansion thay đổi
  this.floorTileSprite.setPosition(startX, startY)
  this.floorTileSprite.setSize(shopW, shopH)
}

// 2. WALL TOP — tường trên cùng có "mái" nhô lên che nhân vật
// Chiều cao visual của tường = 48px (32 "tường" + 16 "mái").
// Origin (0, 1) để đáy tường nằm đúng vị trí shopBounds.y.
if (!this.wallTopSprite) {
  this.wallTopSprite = this.scene.add.tileSprite(startX, startY, shopW, 48, TEX.WALL_TOP)
    .setOrigin(0, 1)
    .setDepth(DEPTH.WALL) // DEPTH.WALL phải > DEPTH.NPC, DEPTH.PLAYER để che nhân vật
} else {
  this.wallTopSprite.setPosition(startX, startY)
  this.wallTopSprite.setSize(shopW, 48)
}

// 3. WALL SIDES (trái, phải, dưới) — dùng wall_side
// Dọn dẹp side walls cũ trước khi tạo lại
this.wallSideSprites.forEach(s => s.destroy())
this.wallSideSprites = []

const SIDE_T = 32 // chiều dày visual tường bên
// Left wall
const wL = this.scene.add.tileSprite(startX - SIDE_T, startY, SIDE_T, shopH, TEX.WALL_SIDE)
  .setOrigin(0, 0).setDepth(DEPTH.WALL)
this.wallSideSprites.push(wL)
// Right wall
const wR = this.scene.add.tileSprite(startX + shopW, startY, SIDE_T, shopH, TEX.WALL_SIDE)
  .setOrigin(0, 0).setDepth(DEPTH.WALL)
this.wallSideSprites.push(wR)

// Bottom wall (chừa cửa ra vào ở giữa)
const doorWidth = 80
const bottomLeftW  = (shopW - doorWidth) / 2
const bottomRightW = (shopW - doorWidth) / 2
const wBL = this.scene.add.tileSprite(startX, startY + shopH, bottomLeftW, SIDE_T, TEX.WALL_SIDE)
  .setOrigin(0, 0).setDepth(DEPTH.WALL)
this.wallSideSprites.push(wBL)
const wBR = this.scene.add.tileSprite(startX + shopW - bottomRightW, startY + shopH, bottomRightW, SIDE_T, TEX.WALL_SIDE)
  .setOrigin(0, 0).setDepth(DEPTH.WALL)
this.wallSideSprites.push(wBR)

// 4. Cũ — graphic expansion preview (GIỮ NGUYÊN block if (this.scene.previewGraphics))
if (this.scene.previewGraphics) {
  this.scene.previewGraphics.clear()
  if (store.settings.showExpansionPreview) {
    // ... toàn bộ code preview cũ giữ nguyên ...
  }
}

// 5. Cuối cùng: Đồng bộ hoá vật lý (GIỮ NGUYÊN)
this.computeExteriorZones()
this.drawSidewalk()
this.updatePhysicalWalls()
```

### 11.3 Sidewalk — Chuyển sang TileSprite

Trong `drawSidewalk()`, thay `fillStyle(0x5a6478, 1).fillRect(...)` bằng:

```ts
// Thay vì graphics, dùng TileSprite
// Thêm field class: private sidewalkTileSprite?: Phaser.GameObjects.TileSprite

const door = this.doorLocation
const shopW = this.shopBounds.w
const sidewalkY = door.y + 40
const sidewalkH = 90
const sidewalkX = this.shopBounds.x - 100
const sidewalkW = shopW + 200

if (!this.sidewalkTileSprite) {
  this.sidewalkTileSprite = this.scene.add.tileSprite(
    sidewalkX, sidewalkY, sidewalkW, sidewalkH, TEX.SIDEWALK_TILE
  ).setOrigin(0, 0).setDepth(DEPTH.FLOOR + 0.1)
} else {
  this.sidewalkTileSprite.setPosition(sidewalkX, sidewalkY)
  this.sidewalkTileSprite.setSize(sidewalkW, sidewalkH)
}
```

> ⚠️ **KHÔNG XOÁ** `sidewalkGraphics` nếu còn code khác đang dùng. Chỉ clear nó: `this.sidewalkGraphics.clear()`. Nếu xác nhận không còn ai dùng, remove field và các lệnh init.

### 11.4 Tại sao tường trên che được nhân vật?

Vì:
- `DEPTH.WALL = 50` (ta sẽ set ở phần 12).
- Nhân vật `sprite.depth = sprite.y` — thường trong range 200-800.

Nhưng ta **không** muốn wall che nhân vật **khi nhân vật ở phía dưới wall**. Cơ chế đúng là:

- Wall **top** (cạnh trên shop) có `y` nhỏ hơn nhân vật → theo Y-sort, nhân vật đè wall top.
- Nhưng phần "mái" 16px của wall_top nhô **xuống phía dưới** đường `shopBounds.y` nhờ origin `(0, 1)` → khi nhân vật đứng sát mép trên (nhân vật.y ≈ shopBounds.y + 20), wall top có bottom = shopBounds.y, tức cao hơn nhân vật → vẫn bị nhân vật đè.

⇒ Để cơ chế "wall che nhân vật ở mép trên" hoạt động, ta phải cho wall top cũng **tham gia Y-sort**:

```ts
// Sau khi tạo this.wallTopSprite:
this.wallTopSprite.setDepth(startY) // Y-sort theo đáy của wall top
```

Lúc này khi nhân vật.y = startY + 20, depth nhân vật = startY + 20, wall top depth = startY → **nhân vật đè wall** (mong muốn, vì nhân vật ở dưới wall top).

Khi nhân vật đi **lên** sát mép (nhân vật.y < startY + 15), nhân vật.depth < wall.depth → wall đè nhân vật → **hiệu ứng che đúng như 2.5D**.

> Tuy nhiên nhân vật không nên đi *ra ngoài* shop (đã có collider tường), nên trường hợp này chỉ xảy ra ngắn và tạo cảm giác "thấp thoáng sau tường".

---

## 12. Cập nhật DEPTH Config

Hiện tại `DEPTH` trong `src/features/environment/config/index.ts` có:

```ts
FLOOR: 2,
WALL_GRAPHICS: 3,
WALL: 5,
FURNITURE: 10,
NPC: 15,
PLAYER: 20,
```

Với 2.5D, ta **KHÔNG** dùng các const này làm `setDepth()` cho entity động — entity động dùng `sprite.y`. DEPTH const chỉ còn dùng cho:

- Layer nền (floor, sidewalk)
- UI, graphics tĩnh không Y-sort (overlay, ghost, preview)
- Wall (có Y-sort riêng)

**Sửa file** `src/features/environment/config/index.ts`:

```ts
/**
 * Centralized Depth (Z-index) cho layer TĨNH và UI.
 * 
 * 🆕 VỚI 2.5D: Entity động (Player, NPC, Staff, Furniture, Box) KHÔNG dùng các const này
 * mà dùng sprite.setDepth(sprite.y) — quản lý qua ySortUtils.ts.
 * 
 * Range an toàn cho Y-sort: 0 ~ 10,000 (y tọa độ của entity)
 * → UI depth phải ≥ 10,001 để luôn ở trên.
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
  UI_TEXT: 10_001,
  UI: 11_000,
  EDIT_OVERLAY: 10_900,
  GHOST: 10_100,
  PLACEMENT_VISUALIZER: 10_150,
  PREVIEW: 10_200,
}
```

> **Thay đổi chính:** các UI depth dời lên `10_000+` để không đụng với Y-sort range. Nếu bạn để `UI: 1000` và entity có `y = 1500` thì UI sẽ bị entity đè lên → lỗi hiển thị.

---

## 13. Checklist QA cuối cùng

Sau khi hoàn tất, **chạy lần lượt 15 test case** sau. Nếu **bất kỳ case nào fail**, revert và đọc lại mục tương ứng.

| # | Kịch bản | Kỳ vọng | Mục tham chiếu |
|---|---|---|---|
| 1 | Spawn vào game, Player xuất hiện | Player đứng ở cửa, frame 0 "down idle", origin giữa-đáy | §6.1 |
| 2 | Di chuyển Player W/A/S/D | Anim đổi đúng 4 hướng; dừng ở frame đầu hướng cuối cùng | §6.2 |
| 3 | Player đi vòng ra **sau** shelf | Player bị shelf che từ vai trở xuống | §5.1, §9.1 |
| 4 | Player đi **trước** shelf (về phía camera) | Player đè lên shelf (vẽ lên trên) | §4.1 R2 |
| 5 | Spawn NPC | NPC có sprite, anim chạy khi di chuyển | §7.1 |
| 6 | NPC lại gần cashier, shelf, NPC khác | Y-sort đúng — ai có y lớn hơn vẽ đè | §7.2 |
| 7 | Hire Staff → Staff spawn ở idle zone | Staff dùng `TEX.STAFF` (khác màu NPC) | §8.1 |
| 8 | Staff fetch box → carry → restock → dispose | Full state machine chạy mượt, **KHÔNG** crash | §8 cảnh báo ⚠️ |
| 9 | Box rơi từ trên xuống bãi delivery | Box bouncing, Y-sort đúng khi chạm đất | §10.3 |
| 10 | Player/Staff cầm box di chuyển | Box vẽ trên người cầm (depth = carrier.y + 1) | §10.4 |
| 11 | Mở BuildMode, preview Ghost | Ghost sprite có setOrigin đúng, hover khắp shop OK | (giữ nguyên logic) |
| 12 | Mở rộng Lot A+1 | Tường + sàn reflow đúng, tile không giãn xấu | §11.2 |
| 13 | Player đi sát mép trên shop | Một phần thân trên bị wall_top che | §11.4 |
| 14 | Mở CartSidebar / các Vue overlay | UI Vue vẫn trên cùng, không bị entity đè | §12 |
| 15 | Debug Physics (phím G) | Collider shelf chỉ ~30% đáy, chứ không phải toàn sprite | §5.1 |

### 13.1 Smoke test Automation (optional — cho project CI)

Nếu dự án có Playwright/Vitest, thêm snapshot test:

```ts
// tests/graphics/25d.spec.ts
describe('2.5D Y-Sort invariant', () => {
  it('Player depth mirrors y coordinate', () => {
    const scene = getMainScene()
    scene.player.y = 500
    scene.update(0, 16)
    expect(scene.player.depth).toBe(500)
  })

  it('Shelf collider height is ~30% of sprite height', () => {
    const shelf = spawnShelfAt(300, 300)
    const bodyH = shelf.body.height
    const dispH = shelf.displayHeight
    expect(bodyH / dispH).toBeCloseTo(0.3, 1)
  })
})
```

---

## 📌 Lời kết

Bạn đã có trong tay blueprint chi tiết để nâng shop từ khối hình cơ bản sang 2.5D Stardew-style **mà không đụng 1 dòng nào của AI logic**. Toàn bộ State Machine của Staff, NPC, Delivery Zone, và Environment Refresh — **không thay đổi hành vi**, chỉ đổi **cách hiển thị**.

### Thứ tự triển khai đề xuất (làm theo đúng):

1. **§2, §3** — Tạo `assetKeys.ts`, import assets, đăng ký anims. **Merge & test build**.
2. **§4** — Tạo `ySortUtils.ts`. **Merge & smoke test** (helper vẫn chưa được gọi ở đâu).
3. **§12** — Dời DEPTH UI lên 10,000+. **Test UI vẫn hiển thị đúng**.
4. **§6** — Upgrade Player. **Test di chuyển, anim, Y-sort quanh shelf cũ**.
5. **§7** — Upgrade NPCManager. **Test spawn 5 NPC, quan sát state chạy đúng**.
6. **§8** — Upgrade StaffManager. **Test đầy đủ restock flow**.
7. **§9** — Upgrade FurnitureManager. **Test place / pickup / edit shelf**.
8. **§10** — Upgrade DeliveryManager. **Test box rơi, carry, restock bằng box mới**.
9. **§11** — Upgrade EnvironmentManager (tường/sàn). **Test expansion**.
10. **§13** — Chạy 15 test case checklist.

Nếu bước nào fail, **revert bước đó** (không revert blueprint trước), fix, rồi tiếp tục. **KHÔNG** làm 10 bước cùng lúc — diff sẽ quá lớn và debug sẽ là cơn ác mộng.

Chúc bạn thành công — và đừng quên: **mỗi lần bạn định gõ `// ... existing code ...`, một AI engineer ở đâu đó phải debug trong nước mắt.** 🙏