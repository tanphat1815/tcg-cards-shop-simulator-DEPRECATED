// NPCLocomotion.ts — Thay thế physics.moveTo()
// Mục tiêu: Di chuyển chính xác qua từng node của A*, snap vào tâm grid
// Animation: Tính toán hướng dựa trên node hiện tại và node kế tiếp

import Phaser from 'phaser'
import { aStarGrid } from '../../environment/managers/AStarGridManager'
import type { WorldPoint } from '../../environment/managers/AStarGridManager'
import { applyDynamicYSort } from '../../environment/ySortUtils'

export class NPCLocomotion {
  private scene: Phaser.Scene
  private sprite: Phaser.Physics.Arcade.Sprite
  private path: WorldPoint[] = []
  private currentTween: Phaser.Tweens.Tween | null = null
  private speed: number = 100 // ms per node

  // Stuck Detection
  private lastPos: { x: number, y: number } = { x: 0, y: 0 }
  private lastMoveTime: number = 0

  constructor(scene: Phaser.Scene, sprite: Phaser.Physics.Arcade.Sprite) {
    this.scene = scene
    this.sprite = sprite
  }

  /**
   * Di chuyển tới mục tiêu world space dùng A*
   */
  moveTo(targetX: number, targetY: number, speed: number = 100) {
    this.speed = speed
    const newPath = aStarGrid.findPath(
      { x: this.sprite.x, y: this.sprite.y },
      { x: targetX, y: targetY }
    )

    if (!newPath || newPath.length === 0) {
      this.stop()
      return false
    }

    this.path = newPath
    this.startPathFollowing()
    return true
  }

  /**
   * Đuổi theo mảng tọa độ dùng Tween Timeline
   * CRITICAL: Physics velocity phải bằng 0 để tránh trượt
   */
  private startPathFollowing() {
    if (this.currentTween) this.currentTween.stop()
    this.sprite.body!.velocity.set(0)

    if (this.path.length === 0) return

    const nextNode = this.path.shift()!
    this.moveToNode(nextNode)
  }

  private moveToNode(node: WorldPoint) {
    // 1. Xác định hướng Animation
    this.updateAnimation(node)

    // 2. Tính duration dựa trên khoảng cách (thường là 1 node = speed)
    const dist = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, node.x, node.y)
    const duration = (dist / 16) * this.speed 

    this.currentTween = this.scene.tweens.add({
      targets: this.sprite,
      x: node.x,
      y: node.y,
      duration: duration,
      onUpdate: () => {
        // Y-Sort mỗi frame khi đang di chuyển
        applyDynamicYSort(this.sprite)
      },
      onComplete: () => {
        if (this.path.length > 0) {
          const next = this.path.shift()!
          this.moveToNode(next)
        } else {
          this.stop()
        }
      }
    })

    this.lastMoveTime = this.scene.time.now
    this.lastPos = { x: this.sprite.x, y: this.sprite.y }
  }

  private updateAnimation(target: WorldPoint) {
    const dx = target.x - this.sprite.x
    const dy = target.y - this.sprite.y
    const prefix = this.sprite.texture.key.includes('staff') ? 'staff' : 'npc'

    if (Math.abs(dx) > Math.abs(dy)) {
      this.sprite.anims.play(dx < 0 ? `${prefix}-left` : `${prefix}-right`, true)
    } else {
      this.sprite.anims.play(dy < 0 ? `${prefix}-up` : `${prefix}-down`, true)
    }
  }

  stop() {
    if (this.currentTween) {
      this.currentTween.stop()
      this.currentTween = null
    }
    this.sprite.body!.velocity.set(0)
    if (this.sprite.anims.isPlaying) this.sprite.anims.stop()
    this.path = []
  }

  get isMoving(): boolean {
    return (this.currentTween !== null && this.currentTween.isPlaying())
  }

  /** Cập nhật logic Anti-stuck (gọi mỗi update) */
  update() {
    if (this.isMoving) {
        const elapsed = this.scene.time.now - this.lastMoveTime
        const dist = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, this.lastPos.x, this.lastPos.y)
        
        // Nếu qua 1s mà không nhích được tí nào -> Re-path hoặc Warp
        if (elapsed > 1000 && dist < 2) {
            console.warn('[Locomotion] NPC Stuck detected - force stopping')
            this.stop()
        }
    }
  }
}
