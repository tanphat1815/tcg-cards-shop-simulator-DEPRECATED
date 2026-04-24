import Phaser from 'phaser'
import playerSheet from '../assets/images/player_sheet.png'
import gymBuildingImg from '../assets/images/gym_building.svg'
import { TEX } from '../features/environment/assetKeys'
import {
  applyDynamicYSort,
  applyFootCollider,
  createDropShadow,
  updateDropShadow
} from '../features/environment/ySortUtils'
import { DEPTH } from '../features/environment/config'
import { PlayerFSM, type PlayerFacing } from './PlayerFSM'
import { registerCharacterAnimations } from './utils/characterAnimations'
import { useGameStore } from '../features/shop-ui/store/gameStore'
import { useStatsStore } from '../features/stats/store/statsStore'
import { useGymStore } from '../features/gym/store/gymStore'
import { TownManager } from '../features/gym/managers/TownManager'
import { AppConfig } from './config/AppConfig'
import { useWorldStore } from '../features/world/store/worldStore'
import { SHOP_SCENE_KEY, TOWN_SCENE_KEY } from '../features/world/constants'
import { GAME_BALANCE } from '../config/gameConfig'
import { WorldActorProjectionManager } from '../features/world/managers/WorldActorProjectionManager'

interface TownSceneData {
  spawnX?: number
  spawnY?: number
  facing?: PlayerFacing
}

export default class TownScene extends Phaser.Scene {
  public player!: Phaser.Physics.Arcade.Sprite

  private playerShadow!: Phaser.GameObjects.Graphics
  private playerFSM!: PlayerFSM
  private townManager!: TownManager
  private projectionManager!: WorldActorProjectionManager
  private gateHintText!: Phaser.GameObjects.Text
  private isTransitioning = false
  private cursors!: {
    up: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
  }
  private keyE!: Phaser.Input.Keyboard.Key
  private storeUnsubscribers: Array<() => void> = []
  private pendingSpawn: TownSceneData = {}
  private lastSnapshotSyncAt = 0

  constructor() {
    super({ key: TOWN_SCENE_KEY })
  }

  init(data: TownSceneData) {
    this.pendingSpawn = data ?? {}
  }

  preload() {
    if (!this.textures.exists(TEX.PLAYER)) {
      this.load.spritesheet(TEX.PLAYER, playerSheet, { frameWidth: 32, frameHeight: 48 })
    }

    AppConfig.ASSETS.NPC_POOLS.forEach((pool) => {
      if (!this.textures.exists(pool.key)) {
        this.load.spritesheet(pool.key, `src/assets/images/${pool.path}`, { frameWidth: 32, frameHeight: 48 })
      }
    })

    AppConfig.ASSETS.STAFF_POOLS.forEach((pool) => {
      if (!this.textures.exists(pool.key)) {
        this.load.spritesheet(pool.key, `src/assets/images/${pool.path}`, { frameWidth: 32, frameHeight: 48 })
      }
    })

    if (!this.textures.exists('gym_building')) {
      this.load.image('gym_building', gymBuildingImg)
    }
  }

  create(data: TownSceneData) {
    try {
      this.pendingSpawn = data ?? this.pendingSpawn ?? {}

      registerCharacterAnimations(this)

      const gymStore = useGymStore()
      gymStore.initializeGymLeaders()

      this.physics.world.setBounds(
        TownManager.TOWN_START_X,
        TownManager.TOWN_START_Y,
        TownManager.TOWN_WIDTH,
        TownManager.TOWN_HEIGHT
      )

      this.cameras.main
        .setBounds(
          TownManager.TOWN_START_X,
          TownManager.TOWN_START_Y,
          TownManager.TOWN_WIDTH,
          TownManager.TOWN_HEIGHT
        )
        .setBackgroundColor('#000000')
        .setZoom(AppConfig.GAME.CAMERA.ZOOM)
        .setRoundPixels(true)

      this.townManager = new TownManager(this)
      this.townManager.initializeTown()
      this.projectionManager = new WorldActorProjectionManager(this)

      this.player = this.physics.add.sprite(0, 0, TEX.PLAYER, 0)
      this.player.setOrigin(0.5, 1)
      applyFootCollider(this.player, 0.3)
      this.player.refreshBody()
      this.player.setCollideWorldBounds(true)
      applyDynamicYSort(this.player)

      this.playerShadow = createDropShadow(this, this.player, { radiusX: 14, radiusY: 6, alpha: 0.35 })

      this.physics.add.collider(this.player, this.townManager.gymGroup)

      this.setupInputs()
      this.setupUI()
      this.setupStoreSubscriptions()
      this.restorePlayerSnapshot()

      this.playerFSM = new PlayerFSM(this.player, this.cursors, GAME_BALANCE.PLAYER.BASE_SPEED, 'player')

      this.cameras.main.startFollow(this.player, true, 0.08, 0.08)
      this.cameras.main.fadeIn(250, 0, 0, 0)

      this.events.on(Phaser.Scenes.Events.WAKE, this.handleWake, this)
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this)

      const worldStore = useWorldStore()
      worldStore.setCurrentScene(TOWN_SCENE_KEY, 'town')
      gymStore.setPlayerInTown(true)
    } catch (error) {
      console.error('[TownScene] Create failed:', error)
    }
  }

  update(_time: number, _delta: number) {
    if (!this.player?.body || !this.keyE) return

    try {
      this.playerFSM.update()
      applyDynamicYSort(this.player)
      updateDropShadow(this.playerShadow, this.player, { radiusX: 14, radiusY: 6, alpha: 0.35 })

      this.townManager.update(this.player.x, this.player.y)
      this.projectionManager.update(this.time.now)
      this.updateGateHint()

      if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
        this.handleInteract()
      }

      if (this.time.now > this.lastSnapshotSyncAt + 250) {
        this.syncPlayerSnapshot()
        this.lastSnapshotSyncAt = this.time.now
      }
    } catch (error) {
      console.error('[TownScene] Update failed:', error)
    }
  }

  private setupInputs() {
    const statsStore = useStatsStore()
    const controls = statsStore.settings.controls

    if (!this.input.keyboard) return

    this.cursors = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes[controls.MOVE_UP as keyof typeof Phaser.Input.Keyboard.KeyCodes] || Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes[controls.MOVE_DOWN as keyof typeof Phaser.Input.Keyboard.KeyCodes] || Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes[controls.MOVE_LEFT as keyof typeof Phaser.Input.Keyboard.KeyCodes] || Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes[controls.MOVE_RIGHT as keyof typeof Phaser.Input.Keyboard.KeyCodes] || Phaser.Input.Keyboard.KeyCodes.D
    }) as any

    this.keyE = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes[controls.INTERACT as keyof typeof Phaser.Input.Keyboard.KeyCodes] ||
      Phaser.Input.Keyboard.KeyCodes.E
    )
  }

  private setupUI() {
    this.gateHintText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height - 100,
      AppConfig.UI.MESSAGES.RETURN_TO_SHOP,
      {
        fontSize: '24px',
        color: '#ffffff',
        fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: { x: 20, y: 10 }
      }
    )
      .setOrigin(0.5)
      .setDepth(DEPTH.UI)
      .setScrollFactor(0)
      .setVisible(false)
  }

  private setupStoreSubscriptions() {
    const gameStore = useGameStore()

    const unsubscribeGame = gameStore.$subscribe((_, state) => {
      if (state.isPaused) {
        this.scene.pause()
      } else if (this.scene.isPaused()) {
        this.scene.resume()
      }
    })

    this.storeUnsubscribers.push(unsubscribeGame)
  }

  private restorePlayerSnapshot() {
    const worldStore = useWorldStore()
    const fallback = worldStore.getPlayerSnapshot(TOWN_SCENE_KEY)
    const snapshot = {
      x: Number.isFinite(this.pendingSpawn.spawnX) ? Number(this.pendingSpawn.spawnX) : fallback.x,
      y: Number.isFinite(this.pendingSpawn.spawnY) ? Number(this.pendingSpawn.spawnY) : fallback.y,
      facing: this.pendingSpawn.facing ?? fallback.facing
    }

    this.player.setPosition(snapshot.x, snapshot.y)
    this.player.setVelocity(0)

    if (this.playerFSM) {
      this.playerFSM.resetToIdle(snapshot.facing)
    } else {
      this.player.setFrame(this.getIdleFrame(snapshot.facing))
    }

    worldStore.syncPlayerSnapshot(TOWN_SCENE_KEY, snapshot)
  }

  private getIdleFrame(facing: PlayerFacing) {
    if (facing === 'left') return 4
    if (facing === 'right') return 8
    if (facing === 'up') return 12
    return 0
  }

  private handleInteract() {
    const distToShopGate = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      TownManager.TOWN_START_X + 50,
      500
    )

    if (distToShopGate < GAME_BALANCE.MAP.TRANSITION_DIST_THRESHOLD) {
      this.transitionToShopScene()
    }
  }

  private transitionToShopScene() {
    if (this.isTransitioning) return

    const worldStore = useWorldStore()
    const spawnX = 1000 + 400
    const spawnY = 1000 + 600 + 100

      this.syncPlayerSnapshot()
      worldStore.syncPlayerSnapshot(SHOP_SCENE_KEY, { x: spawnX, y: spawnY, facing: 'down' })
      worldStore.beginTransition(TOWN_SCENE_KEY, SHOP_SCENE_KEY, 'shop')
      useGymStore().setPlayerInTown(false)

    this.isTransitioning = true
    this.cameras.main.fadeOut(250, 0, 0, 0)
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      try {
        const targetData: TownSceneData = { spawnX, spawnY, facing: 'down' }
        const targetScene = this.scene.get(SHOP_SCENE_KEY)

        if (targetScene && targetScene.scene.isSleeping()) {
          this.scene.wake(SHOP_SCENE_KEY, targetData)
        } else if (targetScene && targetScene.scene.isPaused()) {
          this.scene.resume(SHOP_SCENE_KEY)
        } else {
          this.scene.launch(SHOP_SCENE_KEY, targetData)
        }

        this.scene.sleep(TOWN_SCENE_KEY)
      } catch (error) {
        console.error('[TownScene] Failed to switch to shop:', error)
        worldStore.finishTransition()
        this.isTransitioning = false
        this.cameras.main.fadeIn(250, 0, 0, 0)
      }
    })
  }

  private updateGateHint() {
    if (this.isTransitioning) {
      this.gateHintText.setVisible(false)
      return
    }

    const distToShopGate = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      TownManager.TOWN_START_X + 50,
      500
    )

    this.gateHintText
      .setText(AppConfig.UI.MESSAGES.RETURN_TO_SHOP)
      .setVisible(distToShopGate < GAME_BALANCE.MAP.TRANSITION_DIST_THRESHOLD)
  }

  private syncPlayerSnapshot() {
    try {
      const worldStore = useWorldStore()
      worldStore.syncPlayerSnapshot(TOWN_SCENE_KEY, {
        x: this.player?.x ?? 0,
        y: this.player?.y ?? 0,
        facing: this.playerFSM?.currentFacing ?? 'down'
      })
    } catch (error) {
      console.error('[TownScene] Failed to sync player snapshot:', error)
    }
  }

  private handleWake(_sys: Phaser.Scenes.Systems, data: TownSceneData) {
    try {
      this.pendingSpawn = data ?? {}
      this.restorePlayerSnapshot()
      this.isTransitioning = false
      this.cameras.main.fadeIn(250, 0, 0, 0)

      const worldStore = useWorldStore()
      worldStore.setCurrentScene(TOWN_SCENE_KEY, 'town')
      worldStore.finishTransition()
      useGymStore().setPlayerInTown(true)
    } catch (error) {
      console.error('[TownScene] Wake failed:', error)
    }
  }

  private handleShutdown() {
    this.syncPlayerSnapshot()
    this.storeUnsubscribers.forEach((unsubscribe) => unsubscribe())
    this.storeUnsubscribers = []
    this.events.off(Phaser.Scenes.Events.WAKE, this.handleWake, this)
    this.playerShadow?.destroy()
    this.gateHintText?.destroy()
    this.projectionManager?.destroy()
    this.townManager?.destroy()
  }
}
