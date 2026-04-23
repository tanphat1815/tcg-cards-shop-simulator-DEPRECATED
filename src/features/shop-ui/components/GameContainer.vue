<script setup lang="ts">
/**
 * CRITICAL: Always use toRaw() when passing Phaser objects to Vue refs.
 * Without toRaw(), Vue's reactivity system will recursively walk the entire
 * WebGL context on every state change, causing severe FPS drops.
 */
import { onMounted, onUnmounted, ref, toRaw } from 'vue'
import Phaser from 'phaser'
import MainScene from '../../../game/MainScene'

const gameContainer = ref<HTMLElement | null>(null)
// Store game instance as a raw ref — NOT reactive
let game: Phaser.Game | null = null

onMounted(() => {
  if (!gameContainer.value) return

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: '100%',
    height: '100%',
    parent: gameContainer.value,
    pixelArt: true,
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 0, x: 0 }, debug: false }
    },
    scene: [MainScene]
  }

  // CRITICAL: Use toRaw on the container element to prevent Vue reactive proxy
  // from intercepting Phaser's DOM manipulation.
  const rawContainer = toRaw(gameContainer.value)
  config.parent = rawContainer

  game = new Phaser.Game(config)
})

onUnmounted(() => {
  if (game) {
    game.destroy(true)
    game = null
  }
})

/**
 * Exposes the raw Phaser game instance to parent components.
 * Usage in parent: const scene = getRawGame()?.scene.getScene('MainScene')
 */
function getRawGame(): Phaser.Game | null {
  return game
}

defineExpose({ getRawGame })
</script>

<template>
  <div ref="gameContainer" class="w-full h-screen overflow-hidden"></div>
</template>
