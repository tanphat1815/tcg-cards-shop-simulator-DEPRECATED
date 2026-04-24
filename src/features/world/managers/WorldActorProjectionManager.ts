import Phaser from 'phaser'
import { AppConfig } from '../../../game/config/AppConfig'
import { DEPTH } from '../../environment/config'
import { applyDynamicYSort, createDropShadow, updateDropShadow } from '../../environment/ySortUtils'
import type { NPCWorldSnapshot, StaffWorldSnapshot } from '../constants'
import { useWorldStore } from '../store/worldStore'

type AmbientActorType = 'npc' | 'staff'

interface AmbientActorView {
  type: AmbientActorType
  sprite: Phaser.GameObjects.Sprite
  shadow: Phaser.GameObjects.Graphics
  targetX: number
  targetY: number
  prevX: number
  prevY: number
}

export class WorldActorProjectionManager {
  private scene: Phaser.Scene
  private actorViews: Map<string, AmbientActorView> = new Map()
  private nextSyncAt = 0

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  update(time: number) {
    if (time < this.nextSyncAt) {
      this.updateActorTransforms()
      return
    }

    this.nextSyncAt = time + 120

    try {
      const worldStore = useWorldStore()
      const npcSnapshots = worldStore.ambientTownNPCs
      const staffSnapshots = worldStore.ambientTownStaffs

      this.syncActorsFromSnapshots(npcSnapshots, staffSnapshots)
      this.updateActorTransforms()
    } catch (error) {
      console.error('[WorldActorProjectionManager] update failed:', error)
    }
  }

  destroy() {
    for (const actor of this.actorViews.values()) {
      actor.shadow.destroy()
      actor.sprite.destroy()
    }
    this.actorViews.clear()
  }

  private syncActorsFromSnapshots(npcSnapshots: NPCWorldSnapshot[], staffSnapshots: StaffWorldSnapshot[]) {
    const seenIds = new Set<string>()

    for (const snapshot of npcSnapshots) {
      const id = snapshot.instanceId
      if (!id) continue
      seenIds.add(id)
      this.upsertActor(id, 'npc', snapshot.x, snapshot.y)
    }

    for (const snapshot of staffSnapshots) {
      const id = snapshot.instanceId
      if (!id) continue
      seenIds.add(id)
      this.upsertActor(id, 'staff', snapshot.x, snapshot.y)
    }

    for (const [id, actor] of this.actorViews) {
      if (seenIds.has(id)) continue
      actor.shadow.destroy()
      actor.sprite.destroy()
      this.actorViews.delete(id)
    }
  }

  private upsertActor(id: string, type: AmbientActorType, x: number, y: number) {
    const safeX = Number.isFinite(x) ? x : 0
    const safeY = Number.isFinite(y) ? y : 0
    const existing = this.actorViews.get(id)

    if (existing) {
      existing.targetX = safeX
      existing.targetY = safeY
      return
    }

    const texture = this.pickTexture(type, id)
    const sprite = this.scene.add.sprite(safeX, safeY, texture, 0)
    sprite.setOrigin(0.5, 1)
    applyDynamicYSort(sprite)

    const shadow = createDropShadow(this.scene, sprite, { radiusX: 11, radiusY: 5, alpha: 0.28 })
    shadow.setDepth(DEPTH.LAYER1_FLOOR + 1)

    this.actorViews.set(id, {
      type,
      sprite,
      shadow,
      targetX: safeX,
      targetY: safeY,
      prevX: safeX,
      prevY: safeY
    })
  }

  private updateActorTransforms() {
    for (const actor of this.actorViews.values()) {
      actor.prevX = actor.sprite.x
      actor.prevY = actor.sprite.y

      actor.sprite.x = Phaser.Math.Linear(actor.sprite.x, actor.targetX, 0.22)
      actor.sprite.y = Phaser.Math.Linear(actor.sprite.y, actor.targetY, 0.22)

      const dx = actor.sprite.x - actor.prevX
      const dy = actor.sprite.y - actor.prevY
      this.updateActorAnimation(actor, dx, dy)
      applyDynamicYSort(actor.sprite)
      updateDropShadow(actor.shadow, actor.sprite, { radiusX: 11, radiusY: 5, alpha: 0.28 })
    }
  }

  private updateActorAnimation(actor: AmbientActorView, dx: number, dy: number) {
    const texture = actor.sprite.texture.key
    const moving = Math.abs(dx) + Math.abs(dy) > 0.05

    if (!moving) {
      if (actor.sprite.anims.isPlaying) actor.sprite.anims.stop()
      return
    }

    let direction: 'down' | 'up' | 'left' | 'right' = 'down'
    if (Math.abs(dx) >= Math.abs(dy)) {
      direction = dx < 0 ? 'left' : 'right'
    } else {
      direction = dy < 0 ? 'up' : 'down'
    }

    const animationKey = `${texture}-${direction}`
    if (this.scene.anims.exists(animationKey)) {
      actor.sprite.anims.play(animationKey, true)
    }
  }

  private pickTexture(type: AmbientActorType, seed: string): string {
    const pools = type === 'staff' ? AppConfig.ASSETS.STAFF_POOLS : AppConfig.ASSETS.NPC_POOLS
    if (pools.length === 0) return type === 'staff' ? 'staff' : 'npc'

    let hash = 0
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
    }

    const index = hash % pools.length
    return pools[index].key
  }
}
