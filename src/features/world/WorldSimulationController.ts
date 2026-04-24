import { useGameStore } from '../shop-ui/store/gameStore'
import { useWorldStore } from './store/worldStore'
import { GAME_BALANCE } from '../../config/gameConfig'

export class WorldSimulationController {
  private timerId: number | null = null

  start() {
    if (this.timerId !== null) return

    this.timerId = window.setInterval(() => {
      this.tick()
    }, GAME_BALANCE.TIMING.TICK_MS)
  }

  stop() {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId)
      this.timerId = null
    }
  }

  private tick() {
    try {
      const gameStore = useGameStore()
      const worldStore = useWorldStore()
      const now = Date.now()

      worldStore.advanceSimulation(now)
      worldStore.updateAmbientTownProjection(now, {
        gameMinute: gameStore.timeInMinutes,
        shopState: gameStore.shopState
      })

      if (
        gameStore.shopState === 'OPEN' &&
        !gameStore.isBuildMode &&
        !gameStore.isEditMode &&
        !gameStore.isPaused &&
        !worldStore.isTransitioning
      ) {
        gameStore.tickTime(1)
      }
    } catch (error) {
      console.error('[WorldSimulationController] Tick failed:', error)
    }
  }
}
