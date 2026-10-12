# Matter.js Migration Plan — TCG Card Shop Simulator

## Xác nhận Hạn chế Arcade Physics vs Matter.js

| Tiêu chí | Arcade Physics | Matter.js |
|---|---|---|
| Hitbox hỗ trợ | AABB (Rectangle) chỉ xoay 90° | Đa giác tùy ý, hình thoi, hình tròn |
| Va chạm ISO | Góc tàng hình ở 4 góc hình chữ nhật | Hitbox khớp chính xác với hình thoi ISO |
| Rotation | Không hỗ trợ xoay body | Hỗ trợ xoay body tự do |
| Performance | Nhanh hơn cho game đơn giản | Nặng hơn nhưng chính xác hơn |
| Gravity control | `gravity.y` | `gravity.x`, `gravity.y` — cần tắt cả 2 |

## Phạm vi Thay đổi

### Bước 1: `GameContainer.vue` — Cấu hình Physics Engine
- Thay `default: 'arcade'` → `default: 'matter'`
- Thêm `matter: { gravity: { x: 0, y: 0 }, debug: true }`
- Giữ `arcade` config cho TownScene (fallback)

### Bước 2: `PhysicsUtils.ts` — File mới (Tiện ích tạo body)
- `createIsometricDiamond(width, height)` → vertices hình thoi 2:1
- `createFootColliderBody(sprite, footRatio)` → body chỉ phần chân
- `computeIsoDepthFromScreen(screenX, screenY)` → depth sorting helper
- `createStaticDiamondBody(scene, x, y, w, h, label)` → full static body

### Bước 3: `FurnitureManager.ts` — Refactor sang Matter bodies
- Xóa `Phaser.Physics.Arcade.StaticGroup` → dùng mảng `MatterJS.BodyType[]`
- Thay `shelvesGroup.create()` → `this.scene.matter.add.sprite()`
- Áp dụng `setBody({ type: 'fromVerts', verts })` cho hình thoi ISO
- Duy trì Y-sorting / iso depth không đổi

### Bước 4: `MainScene.ts` — Refactor Player & Collision
- `this.physics.add.sprite()` → `this.matter.add.sprite()`
- Collision: `this.matter.world.on('collisionstart', ...)`
- Player body: hình tròn nhỏ ở chân
- Walls: Matter static bodies thay cho Arcade static group

### Bước 5: `PlayerFSM.ts` — Refactor velocity API
- `(body as Phaser.Physics.Arcade.Body).setVelocity()` → `(body as MatterJS.BodyType).setVelocity()`
- Thêm friction / frictionAir để chống trượt

### Bước 6: `EnvironmentManager.ts` — Walls → Matter static bodies
- `this.scene.physics.add.staticGroup()` → Matter static bodies
- Wall collision thay bằng Matter rectangles / polygons

### Bước 7: `NPCManager.ts`, `StaffManager.ts` — Entity refactor
- NPC/Staff sprites → `this.scene.physics.add.sprite()` vẫn dùng Arcade cho tween-based movement
- HOẶC chuyển sang Matter sprite nếu cần collision chính xác

> [!IMPORTANT]
> TownScene vẫn giữ Arcade Physics vì nó dùng oblique 2.5D, không cần ISO hitbox.

## Thứ tự Triển khai

1. ✅ `PhysicsUtils.ts` — File tiện ích mới (DRY: diamond vertices, collision helpers)
2. ✅ `GameContainer.vue` — Chuyển physics config (Matter when ISO enabled)
3. ✅ `AppConfig.ts` — Thêm MATTER config section (tuning params)
4. ✅ `FurnitureManager.ts` — Refactor hoàn chỉnh (dual-mode architecture)
5. ✅ `MainScene.ts` — Refactor player + collision + walls (Matter sprite + events)
6. ✅ `PlayerFSM.ts` — Refactor velocity API (auto-detect physics engine)
7. ✅ `EnvironmentManager.ts` — Walls refactor (Matter static bodies + cleanup)
8. ⬜ `NPCManager.ts` — NPC refactor (giữ Arcade/tween-based, optional upgrade)
9. ⬜ `StaffManager.ts` — Staff refactor (giữ Arcade/tween-based, optional upgrade)

> [!NOTE]
> TypeScript compilation: **ZERO ERRORS** ✅
> NPC và Staff hiện dùng tween-based movement (NPCLocomotion) nên không cần
> chuyển sang Matter ngay. Chúng sẽ tự hoạt động vì không dùng Arcade collision
> trực tiếp.
