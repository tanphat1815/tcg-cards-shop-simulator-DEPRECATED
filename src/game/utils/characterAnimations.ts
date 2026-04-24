import Phaser from 'phaser'
import { AppConfig } from '../config/AppConfig'
import { TEX } from '../../features/environment/assetKeys'

export function registerCharacterAnimations(scene: Phaser.Scene) {
  const definitions: Array<{ prefix: string; key: string }> = [
    { prefix: 'player', key: TEX.PLAYER }
  ]

  AppConfig.ASSETS.NPC_POOLS.forEach((pool) => {
    definitions.push({ prefix: pool.key, key: pool.key })
  })

  AppConfig.ASSETS.STAFF_POOLS.forEach((pool) => {
    definitions.push({ prefix: pool.key, key: pool.key })
  })

  definitions.push({ prefix: 'npc', key: TEX.NPC })
  definitions.push({ prefix: 'staff', key: TEX.STAFF })

  const directions = [
    { dir: 'down', start: 0 },
    { dir: 'left', start: 4 },
    { dir: 'right', start: 8 },
    { dir: 'up', start: 12 }
  ]

  for (const definition of definitions) {
    for (const direction of directions) {
      const animationKey = `${definition.prefix}-${direction.dir}`

      if (scene.anims.exists(animationKey)) continue

      scene.anims.create({
        key: animationKey,
        frames: scene.anims.generateFrameNumbers(definition.key, {
          start: direction.start,
          end: direction.start + 3
        }),
        frameRate: 8,
        repeat: -1
      })
    }
  }
}
