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
