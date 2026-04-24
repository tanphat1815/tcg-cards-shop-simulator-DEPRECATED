Mình đã nắm rõ các quy tắc: ưu tiên đọc kỹ codebase trước, không giả định kiến trúc sẵn có, giữ luồng dữ liệu Pinia -> Vue -> Phaser, có cleanup đầy đủ, tránh nặng trong update(), và chỉ chỉnh những gì sau khi đã hiểu sự tương tác hiện tại. Bước đầu mình sẽ rà soát cấu trúc project, tìm các Scene/Store/EventBus/hệ thống NPC hiện có để lập bản đồ kiến trúc thật chính xác trước khi đề xuất hay sửa code.


Ran 2 commands
Ran Get-ChildItem -Force
Ran rg --files
Mình đã thấy codebase hiện tại là một project khá lớn chứ không phải demo nhỏ: có MainScene trung tâm, nhiều manager cho environment/customer/staff, nhiều Pinia store riêng, và đã có vài blueprint tài liệu cho scene 2.5D/NPC. Tiếp theo mình sẽ đọc các file lõi để xác định chính xác luồng điều khiển hiện tại, chỗ nào đã có nền tảng sẵn và chỗ nào cần refactor thật sự.


Ran 10 commands
Ran Get-Content package.json
Ran Get-Content src\main.ts
Ran Get-Content src\App.vue
Ran Get-Content src\game\MainScene.ts
Ran Get-Content src\features\shop-ui\components\GameContainer.vue
Ran Get-Content src\features\shared\EventBus.ts
Ran Get-Content src\features\shop-ui\store\gameStore.ts
Ran Get-Content src\features\customer\store\customerStore.ts
Ran Get-Content src\features\gym\store\gymStore.ts
Ran Get-Content src\features\staff\store\staffStore.ts
Mình đã xác nhận một điểm kiến trúc rất quan trọng: hiện tại project vẫn đang dồn gần như toàn bộ world simulation vào MainScene, còn Pinia mới chủ yếu giữ dữ liệu nghiệp vụ và UI state, chưa thật sự là “nguồn sự thật” cho vị trí/lịch trình NPC ngoài màn hình. Bây giờ mình sẽ đi sâu vào các manager để xem mức độ coupling giữa Scene với NPC, staff, pathfinding, town/shop và tìm cách tách ra mà không làm gãy flow cũ.


Ran 10 commands
Ran Get-Content src\features\customer\managers\NPCManager.ts
Ran Get-Content src\features\staff\managers\StaffManager.ts
Ran Get-Content src\features\environment\managers\EnvironmentManager.ts
Ran Get-Content src\game\PlayerFSM.ts
Ran Get-Content src\features\gym\managers\TownManager.ts
Ran Get-Content src\features\customer\managers\CustomerFSM.ts
Ran Get-Content src\features\customer\managers\NPCLocomotion.ts
Ran Get-Content src\features\furniture\managers\FurnitureManager.ts
Ran Get-Content docs\24_Tcg_2.5d_refactor.md
Ran Get-Content src\features\environment\managers\AStarGridManager.ts
Mình đã thấy repo có một bản refactor 2.5D trước đó, và phần này phần lớn đã được áp dụng rồi: wall front/top, foot collider, shadow, PlayerFSM, A* grid. Vấn đề lớn còn lại nằm ở kiến trúc scene và simulation: shop/town vẫn đang sống chung trong một MainScene, NPC/staff AI vẫn gắn chặt vào Phaser object thay vì được mô phỏng độc lập trong Pinia/controller.


Ran 10 commands
Ran Get-Content docs\25_update_scence.md
Ran Get-Content src\features\customer\types\index.ts
Ran Get-Content src\features\environment\ySortUtils.ts
Ran Get-Content src\features\staff\types\index.ts
Ran rg -n "TownManager|MainScene|scene: \[|isPlayerInTown|warpGate|transition|sleep|stop\(" src docs
Ran git status --short
Ran Get-Content src\game\MainScene.ts | Select-Object -Skip 260 -First 360
Ran Get-Content src\game\MainScene.ts | Select-Object -First 260
Ran Get-Content src\features\shared\StateMachine.ts
Ran Get-Content src\features\environment\config\index.ts
Mình đã đủ ngữ cảnh để chốt hướng refactor an toàn. Hiện trạng là MainScene đang ôm cả Shop + Town + transition + NPC/Staff lifecycle, trong khi phần 2.5D cơ bản đã có rồi; vì vậy phần refactor đáng làm nhất bây giờ là tách scene và dựng lớp simulation độc lập để Phaser chỉ còn nhiệm vụ render.

Mình đã đọc khá kỹ project và xác nhận là đã hiểu đúng các quy tắc làm việc của bạn.

Hiện trạng mình thấy như sau:

Phaser đang tập trung gần như toàn bộ world logic vào src/game/MainScene.ts (line 1).
Vue + Pinia đã quản lý UI/game data khá nhiều, nhưng chưa đóng vai trò “off-screen simulation source of truth” cho vị trí/lịch trình NPC và staff.
Phần 2.5D cốt lõi thực ra đã có nền tảng rồi trong EnvironmentManager.ts (line 1), ySortUtils.ts (line 1), PlayerFSM.ts (line 1), nên mình sẽ không phá đi nếu không cần.
Nút thắt lớn nhất hiện tại là MainScene đang gộp Shop + Town + transition + NPC/Staff runtime, khiến việc đạt kiến trúc kiểu Stardew Valley còn thiếu bước tách scene và simulation layer độc lập.
Trước khi mình bắt đầu sửa code thật, mình cần bạn chốt giúp 1 điểm quan trọng để tránh refactor sai hướng:

Bạn muốn mình refactor theo phạm vi nào ở vòng này?

Chỉ tách ShopScene <-> TownScene + dựng nền móng off-screen simulation cho NPC/Staff, còn Gym/Battle/TradeIn/Grading vẫn chạy như hiện tại để giữ an toàn tối đa.
Tách luôn ShopScene, TownScene, và chuẩn bị cả khung cho GymScene, dù một số flow như battle/gym interaction sẽ phải được nối lại sau trong bước kế tiếp.
Nếu bạn chọn 1, mình sẽ bắt tay refactor ngay theo hướng an toàn nhất và giữ tương thích tính năng cũ tối đa.





7:59 AM
Tôi chọn 2 
8:00 AM


Worked for 10m 51s
Mình sẽ đi theo phương án 2: tách hẳn ShopScene, TownScene, dựng SceneManager điều phối chuyển cảnh, và đồng thời đặt nền simulation layer để các scene không còn phải là nguồn sự thật của vị trí/thực thể. Trước khi sửa file, mình sẽ bóc phần dùng chung ra khỏi MainScene, rồi mới nối lại GameContainer để boot nhiều scene mà vẫn giữ UI Vue và các flow cũ hoạt động.


Ran 3 commands
Ran rg -n "MainScene|getScene\(|scene\.pause\(|pauseGame\(|resumeGame\(" src
Ran Get-Content src\features\shop-ui\components\UIOverlay.vue | Select-Object -First 220
Ran Get-Content src\game\config\AppConfig.ts
Mình chuẩn bị sửa theo 4 mảng: world store + simulation controller, tách TownScene, biến scene hiện tại thành ShopScene, rồi nối App.vue/GameContainer vào bootstrap mới. Mình cũng sẽ thêm snapshot sync tối thiểu cho player/NPC/staff để scene inactive không mất trạng thái render nền tảng, nhưng vẫn giữ nguyên các manager cũ để không làm gãy trade-in, grading, battle, checkout và restock hiện có.


Created 6 files
Created file
UPDATE_GAME_SCENCE.md
+88
-0

# UPDATE_GAME_SCENCE

## Mục tiêu của vòng refactor này

- Tách `ShopScene` và `TownScene` thành hai `Phaser.Scene` độc lập.
- Dời đồng hồ game sang lớp simulation độc lập để scene không còn là nguồn thật của thời gian.
- Đặt nền `Pinia world store` để snapshot player/NPC/staff có nơi lưu tập trung, phục vụ off-screen simulation ở các bước sau.
- Giữ nguyên các tính năng hiện có trong shop: staff, NPC, trade-in, grading, battle, build/edit, grid movement, collision.

## Những gì đã được triển khai

### 1. Scene split

- Scene chính hiện dùng key `ShopScene`.
- Có thêm `TownScene` riêng.
- Chuyển cảnh qua `fadeOut -> wake/launch scene đích -> sleep scene hiện tại -> fadeIn`.
- Shop không còn render Town/Gym nền trong cùng một scene nữa.

### 2. World source of truth

- Thêm `worldStore`:
  - `currentSceneKey`
  - `currentArea`
  - `isTransitioning`
  - `playerByScene`
  - `npcById`
  - `staffById`
- Các scene sync snapshot player vào Pinia.
- `ShopScene` sync snapshot NPC/staff lên Pinia theo chu kỳ nhẹ.

### 3. Off-screen simulation foundation

- Đồng hồ game đã chuyển sang `WorldSimulationController`.
- Controller này chạy độc lập với scene lifecycle, vì vậy khi đi Town thì thời gian game vẫn tiếp tục chạy.
- Đây là bước nền để vòng sau chuyển tiếp logic schedule/NPC AI tính toán ngầm hoàn toàn sang store/controller.

### 4. 2.5D architecture

- Phần 2.5D hiện có trong project vẫn được giữ nguyên:
  - `Wall Front / Wall Top`
  - `Y-sort`
  - `Foot collider`
  - `Drop shadow`
  - `PlayerFSM`

## Kiến trúc sau refactor

```text
Pinia
  ├─ gameStore          -> economy / time / facade
  ├─ worldStore         -> active scene / player snapshots / actor snapshots
  ├─ gymStore           -> gym leaders / overlay state
  └─ các domain store khác

Vue
  ├─ App.vue
  ├─ GameContainer.vue
  └─ UI overlay / modal / HUD

Phaser
  ├─ ShopScene
  └─ TownScene
```

## File mới / thay đổi chính

- `src/features/world/constants.ts`
- `src/features/world/store/worldStore.ts`
- `src/features/world/WorldSimulationController.ts`
- `src/game/TownScene.ts`
- `src/game/utils/characterAnimations.ts`
- `src/game/MainScene.ts`
- `src/features/shop-ui/components/GameContainer.vue`
- `src/App.vue`
- `src/features/customer/managers/NPCManager.ts`
- `src/features/staff/managers/StaffManager.ts`

## Điều chưa làm trong vòng này

- Chưa chuyển toàn bộ FSM NPC/Staff sang chạy hoàn toàn trong Pinia.
- Chưa spawn/render NPC thường trú trong TownScene theo schedule.
- Chưa tách `GymScene` riêng; hiện Gym interaction vẫn đi qua `TownScene + gymStore + Vue overlay`.

## Hướng bước tiếp theo

- Đưa scheduler NPC/staff sang world controller.
- Tạo actor renderer mỏng cho từng scene, chỉ đọc snapshot từ Pinia.
- Tách tiếp `GymScene` nếu muốn render gym interior độc lập như Shop/Town.
Created file
WorldSimulationController.ts
+43
-0

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

      worldStore.advanceSimulation(Date.now())

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
Created file
constants.ts
+31
-0

export const SHOP_SCENE_KEY = 'ShopScene'
export const TOWN_SCENE_KEY = 'TownScene'

export type WorldSceneKey = typeof SHOP_SCENE_KEY | typeof TOWN_SCENE_KEY
export type WorldArea = 'shop' | 'town' | 'gym'

export interface PlayerSceneSnapshot {
  x: number
  y: number
  facing: 'down' | 'up' | 'left' | 'right'
}

export interface NPCWorldSnapshot {
  instanceId: string
  area: WorldArea
  x: number
  y: number
  state: string
  intent: string
  lastUpdatedAt: number
}

export interface StaffWorldSnapshot {
  instanceId: string
  area: WorldArea
  x: number
  y: number
  duty: string
  state: string
  lastUpdatedAt: number
}
Created file
worldStore.ts
+154
-0

import { defineStore } from 'pinia'
import type {
  NPCWorldSnapshot,
  PlayerSceneSnapshot,
  StaffWorldSnapshot,
  WorldArea,
  WorldSceneKey
} from '../constants'
import { SHOP_SCENE_KEY, TOWN_SCENE_KEY } from '../constants'

const DEFAULT_PLAYER_SNAPSHOTS: Record<WorldSceneKey, PlayerSceneSnapshot> = {
  [SHOP_SCENE_KEY]: { x: 0, y: 0, facing: 'down' },
  [TOWN_SCENE_KEY]: { x: 3150, y: 500, facing: 'down' }
}

interface WorldState {
  currentSceneKey: WorldSceneKey
  currentArea: WorldArea
  previousSceneKey: WorldSceneKey | null
  isTransitioning: boolean
  lastSimulationAt: number
  playerByScene: Record<WorldSceneKey, PlayerSceneSnapshot>
  npcById: Record<string, NPCWorldSnapshot>
  staffById: Record<string, StaffWorldSnapshot>
}

export const useWorldStore = defineStore('world', {
  state: (): WorldState => ({
    currentSceneKey: SHOP_SCENE_KEY,
    currentArea: 'shop',
    previousSceneKey: null,
    isTransitioning: false,
    lastSimulationAt: Date.now(),
    playerByScene: { ...DEFAULT_PLAYER_SNAPSHOTS },
    npcById: {},
    staffById: {}
  }),

  getters: {
    npcsInArea: (state) => {
      return (area: WorldArea): NPCWorldSnapshot[] =>
        Object.values(state.npcById).filter((entry) => entry.area === area)
    },
    staffInArea: (state) => {
      return (area: WorldArea): StaffWorldSnapshot[] =>
        Object.values(state.staffById).filter((entry) => entry.area === area)
    },
    getPlayerSnapshot: (state) => {
      return (sceneKey: WorldSceneKey): PlayerSceneSnapshot =>
        state.playerByScene[sceneKey] ?? DEFAULT_PLAYER_SNAPSHOTS[sceneKey]
    }
  },

  actions: {
    beginTransition(fromScene: WorldSceneKey, toScene: WorldSceneKey, toArea: WorldArea) {
      this.previousSceneKey = fromScene
      this.currentSceneKey = toScene
      this.currentArea = toArea
      this.isTransitioning = true
    },

    finishTransition() {
      this.isTransitioning = false
    },

    setCurrentScene(sceneKey: WorldSceneKey, area: WorldArea) {
      this.currentSceneKey = sceneKey
      this.currentArea = area
      this.isTransitioning = false
    },

    syncPlayerSnapshot(sceneKey: WorldSceneKey, snapshot: Partial<PlayerSceneSnapshot>) {
      const current = this.playerByScene[sceneKey] ?? DEFAULT_PLAYER_SNAPSHOTS[sceneKey]
      this.playerByScene[sceneKey] = {
        x: Number.isFinite(snapshot.x) ? Number(snapshot.x) : current.x,
        y: Number.isFinite(snapshot.y) ? Number(snapshot.y) : current.y,
        facing: snapshot.facing ?? current.facing
      }
    },

    syncNPCSnapshots(area: WorldArea, snapshots: NPCWorldSnapshot[]) {
      const seenIds = new Set<string>()

      for (const snapshot of snapshots) {
        if (!snapshot?.instanceId) continue

        seenIds.add(snapshot.instanceId)
        this.npcById[snapshot.instanceId] = {
          instanceId: snapshot.instanceId,
          area,
          x: Number.isFinite(snapshot.x) ? snapshot.x : 0,
          y: Number.isFinite(snapshot.y) ? snapshot.y : 0,
          state: snapshot.state || 'UNKNOWN',
          intent: snapshot.intent || 'BUY',
          lastUpdatedAt: Number.isFinite(snapshot.lastUpdatedAt) ? snapshot.lastUpdatedAt : Date.now()
        }
      }

      for (const [id, snapshot] of Object.entries(this.npcById)) {
        if (snapshot.area === area && !seenIds.has(id)) {
          delete this.npcById[id]
        }
      }
    },

    syncStaffSnapshots(area: WorldArea, snapshots: StaffWorldSnapshot[]) {
      const seenIds = new Set<string>()

      for (const snapshot of snapshots) {
        if (!snapshot?.instanceId) continue

        seenIds.add(snapshot.instanceId)
        this.staffById[snapshot.instanceId] = {
          instanceId: snapshot.instanceId,
          area,
          x: Number.isFinite(snapshot.x) ? snapshot.x : 0,
          y: Number.isFinite(snapshot.y) ? snapshot.y : 0,
          duty: snapshot.duty || 'NONE',
          state: snapshot.state || 'IDLE',
          lastUpdatedAt: Number.isFinite(snapshot.lastUpdatedAt) ? snapshot.lastUpdatedAt : Date.now()
        }
      }

      for (const [id, snapshot] of Object.entries(this.staffById)) {
        if (snapshot.area === area && !seenIds.has(id)) {
          delete this.staffById[id]
        }
      }
    },

    advanceSimulation(now: number) {
      this.lastSimulationAt = now

      for (const snapshot of Object.values(this.npcById)) {
        snapshot.lastUpdatedAt = now
      }

      for (const snapshot of Object.values(this.staffById)) {
        snapshot.lastUpdatedAt = now
      }
    },

    resetWorldState() {
      this.currentSceneKey = SHOP_SCENE_KEY
      this.currentArea = 'shop'
      this.previousSceneKey = null
      this.isTransitioning = false
      this.lastSimulationAt = Date.now()
      this.playerByScene = { ...DEFAULT_PLAYER_SNAPSHOTS }
      this.npcById = {}
      this.staffById = {}
    }
  }
})
Created file
TownScene.ts
+335
-0

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
    this.townManager?.destroy()
  }
}
Created file
characterAnimations.ts
+45
-0

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
Mình đã thêm phần nền mới: worldStore, simulation controller, TownScene, tài liệu cập nhật, và utility animation dùng chung. Bây giờ mình đang nối scene cũ sang vai trò ShopScene, bỏ phần town render khỏi đó, rồi đồng bộ snapshot qua Pinia để hai scene hoạt động đúng nhịp.

Mình đang vá MainScene theo từng khối nhỏ để tránh đụng các đoạn tiếng Việt bị encoding lệch trong file cũ. Mục tiêu vẫn giữ nguyên: scene này trở thành ShopScene thật sự, còn TownScene chạy độc lập và được wake/sleep đúng chuẩn.


Edited 1 file, ran 8 commands
Ran Get-Content src\game\MainScene.ts | Select-Object -Skip 140 -First 120
Ran Get-Content src\game\MainScene.ts | Select-Object -First 140
Ran Get-Content src\game\MainScene.ts | Select-Object -Skip 260 -First 120
Ran Get-Content src\game\MainScene.ts | Select-Object -Skip 840 -First 140
Ran Get-Content src\game\MainScene.ts | Select-Object -Skip 480 -First 120
Edited file
MainScene.ts
+3
-2

import { StaffManager } from '../features/staff/managers/StaffManager'
import { TownManager } from '../features/gym/managers/TownManager'
import { DeliveryManager } from '../features/environment/managers/DeliveryManager'
import { useGymStore } from '../features/gym/store/gymStore'
import { aStarGrid } from '../features/environment/managers/AStarGridManager'
import { GAME_BALANCE } from '../config/gameConfig'
import { useWorldStore } from '../features/world/store/worldStore'
import { SHOP_SCENE_KEY, TOWN_SCENE_KEY } from '../features/world/constants'
import { registerCharacterAnimations } from './utils/characterAnimations'

Edited file
MainScene.ts
+2
-2

  public deliveryManager!: DeliveryManager
  public townManager!: TownManager

  private isTeleporting: boolean = false
  private lastWorldSyncTime: number = 0
  private cursors!: {

  constructor() { super({ key: 'MainScene' }) }
  constructor() { super({ key: SHOP_SCENE_KEY }) }

Edited file
MainScene.ts
+1
-1


    this.registerCharacterAnimations()
    registerCharacterAnimations(this)

Edited file
MainScene.ts
+0
-5


    // Gym
    const gymStore = useGymStore()
    gymStore.initializeGymLeaders()
    this.townManager = new TownManager(this)

    // World / camera bounds
Edited file
MainScene.ts
+0
-1

    this.furnitureManager.initializeFurniture()
    this.townManager.initializeTown()

Edited file
MainScene.ts
+2
-2

    // ── PLAYER SPAWN ──────────────────────────────────────────────────────────
    const doorLoc = this.environmentManager.getDoorLocation()
    this.player = this.physics.add.sprite(doorLoc.x, doorLoc.y - 50, TEX.PLAYER, 0)
    const spawn = this.resolveInitialPlayerSpawn()
    this.player = this.physics.add.sprite(spawn.x, spawn.y, TEX.PLAYER, 0)
    this.player.setOrigin(0.5, 1)
Edited file
MainScene.ts
+0
-11


    // Game clock (1 second real = 1 minute game)
    this.time.addEvent({
      delay: GAME_BALANCE.TIMING.TICK_MS,
      loop: true,
      callback: () => {
        if (gameStore.shopState === 'OPEN' && !gameStore.isBuildMode && !gameStore.isEditMode) {
          gameStore.tickTime(1)
        }
      }
    })

    // Camera drag
Edited file
MainScene.ts
+11
-1


    this.events.on(Phaser.Scenes.Events.WAKE, this.handleWake, this)
    this.events.on(Phaser.Scenes.Events.SLEEP, this.handleSleep, this)

    // Cleanup on shutdown
    this.events.once('shutdown', () => {
      this.syncWorldSnapshots()
      this.storeUnsubscribers.forEach(u => u())
      this.deliveryManager.destroy()
      this.townManager.destroy()
      this.events.off(Phaser.Scenes.Events.WAKE, this.handleWake, this)
      this.events.off(Phaser.Scenes.Events.SLEEP, this.handleSleep, this)
    })

    const worldStore = useWorldStore()
    worldStore.setCurrentScene(SHOP_SCENE_KEY, 'shop')
    this.playerFSM.resetToIdle(spawn.facing)
    this.syncWorldSnapshots()
  }
Edited file
MainScene.ts
+5
-6


    // Area transition
    this.handleAreaTransition()

    // Town manager (gym proximity)
    this.townManager?.update(this.player.x, this.player.y)

    // Gate hints
    this.updateGateHints()

    if (time > this.lastWorldSyncTime + 250) {
      this.syncWorldSnapshots()
      this.lastWorldSyncTime = time
    }
  }
Ran rg -n "private registerCharacterAnimations\(" src\game\MainScene.ts
Ran Get-Content src\game\MainScene.ts | Select-Object -Skip 304 -First 46
Edited file
MainScene.ts
+31
-10

    this.isTeleporting = true
    const gymStore = useGymStore()

    this.cameras.main.fadeOut(300, 0, 0, 0)
    if (!toTown) {
      this.isTeleporting = false
      return
    }

    const worldStore = useWorldStore()
    const targetSpawnX = Number.isFinite(targetX) ? targetX : 3150
    const targetSpawnY = Number.isFinite(targetY) ? targetY : 500

    this.syncWorldSnapshots()
    worldStore.syncPlayerSnapshot(TOWN_SCENE_KEY, { x: targetSpawnX, y: targetSpawnY, facing: 'down' })
    worldStore.beginTransition(SHOP_SCENE_KEY, TOWN_SCENE_KEY, 'town')

    this.cameras.main.fadeOut(250, 0, 0, 0)
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.player.setPosition(targetX, targetY)
      // Sync shadow immediately to avoid 1-frame gap
      updateDropShadow(this.playerShadow, this.player, { radiusX: 14, radiusY: 6, alpha: 0.35 })
      try {
        const targetScene = this.scene.get(TOWN_SCENE_KEY)
        const payload = { spawnX: targetSpawnX, spawnY: targetSpawnY, facing: 'down' as const }

      gymStore.setPlayerInTown(toTown)
      this.player.setVelocity(0)
      this.playerFSM.resetToIdle('down')
        if (targetScene && targetScene.scene.isSleeping()) {
          this.scene.wake(TOWN_SCENE_KEY, payload)
        } else if (targetScene && targetScene.scene.isPaused()) {
          this.scene.resume(TOWN_SCENE_KEY)
        } else {
          this.scene.launch(TOWN_SCENE_KEY, payload)
        }

      this.cameras.main.fadeIn(300, 0, 0, 0)
      this.isTeleporting = false
        this.scene.sleep(SHOP_SCENE_KEY)
      } catch (error) {
        console.error('[MainScene] Failed to switch to town scene:', error)
        worldStore.finishTransition()
        this.isTeleporting = false
        this.cameras.main.fadeIn(250, 0, 0, 0)
      }
    })
Edited file
MainScene.ts
+4
-4

  private handlePlayerInteraction(store: any) {
    const doorPos  = this.environmentManager.getDoorLocation()
    const wz       = this.environmentManager.warpGateZone
    const distTown = Phaser.Math.Distance.Between(this.player.x, this.player.y, wz.x, wz.y)
    const distShop = Phaser.Math.Distance.Between(this.player.x, this.player.y, TownManager.TOWN_START_X + 50, 500)

    if (distTown < 80) { this.performTeleport(TownManager.TOWN_START_X + 150, 500, true);  return }
    if (distShop < 80) { this.performTeleport(doorPos.x, doorPos.y + 100, false);          return }
    if (distTown < GAME_BALANCE.MAP.TRANSITION_DIST_THRESHOLD) {
      this.performTeleport(3150, 500, true)
      return
    }

Edited file
MainScene.ts
+6
-7

  private handleAreaTransition() {
    const gymStore = useGymStore()
    const isInTownX = this.player.x > TownManager.TOWN_START_X - 100
    if (isInTownX !== gymStore.isPlayerInTown) gymStore.setPlayerInTown(isInTownX)
    const worldStore = useWorldStore()
    if (worldStore.currentSceneKey !== SHOP_SCENE_KEY) {
      worldStore.setCurrentScene(SHOP_SCENE_KEY, 'shop')
    }
  }
    const distToTown  = Phaser.Math.Distance.Between(this.player.x, this.player.y, wz.x, wz.y)
    const distToShop  = Phaser.Math.Distance.Between(this.player.x, this.player.y, TownManager.TOWN_START_X + 50, 500)

    if (distToTown < RADIUS)     this.gateHintText.setText(AppConfig.UI.MESSAGES.GO_TO_GYM).setVisible(true)
    else if (distToShop < RADIUS) this.gateHintText.setText(AppConfig.UI.MESSAGES.RETURN_TO_SHOP).setVisible(true)
    else                          this.gateHintText.setVisible(false)
    if (distToTown < RADIUS) this.gateHintText.setText(AppConfig.UI.MESSAGES.GO_TO_GYM).setVisible(true)
    else this.gateHintText.setVisible(false)
  }
Ran Get-Content src\game\MainScene.ts | Select-Object -Skip 500 -First 28
Edited file
MainScene.ts
+67
-0


  private resolveInitialPlayerSpawn() {
    const worldStore = useWorldStore()
    const doorLocation = this.environmentManager.getDoorLocation()
    const fallback = {
      x: doorLocation.x,
      y: doorLocation.y - 50,
      facing: 'down' as const
    }

    try {
      const snapshot = worldStore.getPlayerSnapshot(SHOP_SCENE_KEY)
      return {
        x: Number.isFinite(snapshot.x) && snapshot.x !== 0 ? snapshot.x : fallback.x,
        y: Number.isFinite(snapshot.y) && snapshot.y !== 0 ? snapshot.y : fallback.y,
        facing: snapshot.facing ?? fallback.facing
      }
    } catch (error) {
      console.error('[MainScene] Failed to resolve player spawn:', error)
      return fallback
    }
  }

  private handleWake(_sys: Phaser.Scenes.Systems, data: { spawnX?: number; spawnY?: number; facing?: 'down' | 'up' | 'left' | 'right' }) {
    try {
      const worldStore = useWorldStore()
      const fallback = this.resolveInitialPlayerSpawn()
      const spawnX = Number.isFinite(data?.spawnX) ? Number(data.spawnX) : fallback.x
      const spawnY = Number.isFinite(data?.spawnY) ? Number(data.spawnY) : fallback.y
      const facing = data?.facing ?? fallback.facing

      this.player.setPosition(spawnX, spawnY)
      this.player.setVelocity(0)
      this.playerFSM.resetToIdle(facing)
      updateDropShadow(this.playerShadow, this.player, { radiusX: 14, radiusY: 6, alpha: 0.35 })
      this.cameras.main.startFollow(this.player, true, 0.05, 0.05)
      this.cameras.main.fadeIn(250, 0, 0, 0)

      this.isTeleporting = false
      worldStore.setCurrentScene(SHOP_SCENE_KEY, 'shop')
      worldStore.finishTransition()
      this.syncWorldSnapshots()
    } catch (error) {
      console.error('[MainScene] Wake failed:', error)
    }
  }

  private handleSleep() {
    this.syncWorldSnapshots()
  }

  private syncWorldSnapshots() {
    try {
      const worldStore = useWorldStore()

      worldStore.syncPlayerSnapshot(SHOP_SCENE_KEY, {
        x: this.player?.x ?? 0,
        y: this.player?.y ?? 0,
        facing: this.playerFSM?.currentFacing ?? 'down'
      })

      worldStore.syncNPCSnapshots('shop', this.npcManager?.getWorldSnapshots?.() ?? [])
      worldStore.syncStaffSnapshots('shop', this.staffManager?.getWorldSnapshots?.() ?? [])
    } catch (error) {
      console.error('[MainScene] Failed to sync world snapshots:', error)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
Mình đã nối xong phần lớn ShopScene logic: đồng hồ scene đã được rút ra khỏi Phaser, teleport nội scene đang chuyển thành wake/sleep scene thật, và snapshot sẽ được đẩy về Pinia theo chu kỳ nhẹ. Tiếp theo mình đang vá các manager và bootstrap để build được trơn tru với TownScene mới.


Edited 4 files, ran 3 commands
Edited file
GameContainer.vue
+3
-2

import MainScene from '../../../game/MainScene'
import TownScene from '../../../game/TownScene'

    },
    scene: [MainScene]
    scene: [MainScene, TownScene]
  }
 * Exposes the raw Phaser game instance to parent components.
 * Usage in parent: const scene = getRawGame()?.scene.getScene('MainScene')
 * Usage in parent: const scene = getRawGame()?.scene.getScene('ShopScene')
 */
Ran Get-Content src\App.vue
Edited file
App.vue
+3
-1

<script setup lang="ts">
import { onMounted } from 'vue'
import { onMounted, onUnmounted } from 'vue'
import { AppConfig } from './game/config/AppConfig'
import PocketModal from './features/inventory/components/PocketModal.vue'
import SettingsModal from './features/shop-ui/components/SettingsModal.vue'

import { eventBus, EVENTS } from './features/shared/EventBus'
import { WorldSimulationController } from './features/world/WorldSimulationController'

Edited file
App.vue
+2
-0

const pocketStore = usePlayerPocketStore()
const simulationController = new WorldSimulationController()
const cleanupCallbacks: Array<() => void> = []

Ran Get-Content src\App.vue | Select-Object -Skip 38 -First 60
Edited file
App.vue
+23
-12

  store.loadSave()
  simulationController.start()
  

  statsStore.$subscribe(saveCallback, { deep: true })
  inventoryStore.$subscribe(saveCallback, { deep: true })
  furnitureStore.$subscribe(saveCallback, { deep: true })
  customerStore.$subscribe(saveCallback, { deep: true })
  deliveryStore.$subscribe(saveCallback, { deep: true })
  staffStore.$subscribe(saveCallback, { deep: true })
  playerHandStore.$subscribe(saveCallback, { deep: true })
  tradeInStore.$subscribe(saveCallback, { deep: true })
  gradingStore.$subscribe(saveCallback, { deep: true })
  eventStore.$subscribe(saveCallback, { deep: true })
  pocketStore.$subscribe(saveCallback, { deep: true })
  cleanupCallbacks.push(statsStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(inventoryStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(furnitureStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(customerStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(deliveryStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(staffStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(playerHandStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(tradeInStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(gradingStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(eventStore.$subscribe(saveCallback, { deep: true }))
  cleanupCallbacks.push(pocketStore.$subscribe(saveCallback, { deep: true }))

  // Lắng nghe sự kiện từ NPC AI (Phaser -> Vue)
  eventBus.on(EVENTS.NPC_TRADE_REQUEST, ({ instanceId, cardId }) => {
  const offTradeRequest = eventBus.on(EVENTS.NPC_TRADE_REQUEST, ({ instanceId, cardId }) => {
    tradeInStore.startTrade(instanceId, cardId)
  })
  cleanupCallbacks.push(offTradeRequest)

})

onUnmounted(() => {
  simulationController.stop()

  while (cleanupCallbacks.length > 0) {
    const cleanup = cleanupCallbacks.pop()
    cleanup?.()
  }
})
</script>
Edited file
NPCManager.ts
+15
-0

import { GAME_BALANCE } from '../../../config/gameConfig'
import type { NPCWorldSnapshot } from '../../world/constants'

  }

  public getWorldSnapshots(): NPCWorldSnapshot[] {
    const now = Date.now()

    return Array.from(this.agents.values()).map((agent) => ({
      instanceId: agent.data.instanceId,
      area: 'shop',
      x: Number.isFinite(agent.sprite.x) ? agent.sprite.x : 0,
      y: Number.isFinite(agent.sprite.y) ? agent.sprite.y : 0,
      state: agent.fsm.current || agent.data.state || 'UNKNOWN',
      intent: agent.data.intent || 'BUY',
      lastUpdatedAt: now
    }))
  }
}
Edited file
StaffManager.ts
+15
-0

import { GAME_BALANCE } from '../../../config/gameConfig'
import type { StaffWorldSnapshot } from '../../world/constants'

  }

  public getWorldSnapshots(): StaffWorldSnapshot[] {
    const now = Date.now()

    return Array.from(this.agents.values()).map((agent) => ({
      instanceId: agent.instanceId,
      area: 'shop',
      x: Number.isFinite(agent.sprite.x) ? agent.sprite.x : 0,
      y: Number.isFinite(agent.sprite.y) ? agent.sprite.y : 0,
      duty: agent.duty,
      state: agent.fsm.current || 'IDLE',
      lastUpdatedAt: now
    }))
  }
}
Ran rg -n "useGymStore|TownManager|registerCharacterAnimations\(|syncWorldSnapshots|resolveInitialPlayerSpawn|SHOP_SCENE_KEY|TOWN_SCENE_KEY" src\game\MainScene.ts
Mình đang làm vòng rà cuối cho chỗ phụ thuộc chéo: các scene key, bootstrap, và các manager snapshot. Sau đó mình sẽ chạy build TypeScript để bắt lỗi compile sớm thay vì để bạn gặp lỗi lúc test scene transition.


Ran 5 commands
Ran rg -n "getScene\('MainScene'\)|'MainScene'|scene: \[MainScene\]|TownManager|useGymStore" src
Ran Get-Content src\game\MainScene.ts | Select-Object -Skip 140 -First 110
Ran Get-Content src\game\MainScene.ts | Select-Object -Skip 500 -First 120
Ran rg -n "TownManager|useGymStore" src\game\MainScene.ts
Ran Get-Content src\App.vue | Select-Object -First 120
Phần code đã nối xong ở mức kiến trúc: boot nhiều scene, scene transition bằng sleep/wake, và time tick tách khỏi Phaser. Mình sẽ chạy build ngay bây giờ để bắt nốt các lỗi TypeScript hoặc import còn sót trước khi chốt lại cho bạn.


Edited 1 file, ran 6 commands
Ran command
$ npm run build

npm : File C:\nvm4w\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system. For more 
information, see about_Execution_Policies at https:/go.microsoft.com/fwlink/?LinkID=135170.
At line:2 char:1
+ npm run build
+ ~~~
    + CategoryInfo          : SecurityError: (:) [], PSSecurityException
    + FullyQualifiedErrorId : UnauthorizedAccess

Exit code 1
Ran npm.cmd run build
Edited file
MainScene.ts
+0
-39


  private registerCharacterAnimations() {
    const defs: Array<{ prefix: string, key: string }> = [
      { prefix: 'player', key: TEX.PLAYER }
    ]

    // Register animations for all NPC skins
    AppConfig.ASSETS.NPC_POOLS.forEach(pool => {
      defs.push({ prefix: pool.key, key: pool.key })
    })

    // Register animations for all Staff skins
    AppConfig.ASSETS.STAFF_POOLS.forEach(pool => {
      defs.push({ prefix: pool.key, key: pool.key })
    })

    // Legacy fallback for generic 'npc' and 'staff' keys
    defs.push({ prefix: 'npc', key: TEX.NPC })
    defs.push({ prefix: 'staff', key: TEX.STAFF })

    const dirs = [
      { dir: 'down',  start: 0  },
      { dir: 'left',  start: 4  },
      { dir: 'right', start: 8  },
      { dir: 'up',    start: 12 }
    ]
    for (const { prefix, key } of defs) {
      for (const { dir, start } of dirs) {
        const animKey = `${prefix}-${dir}`
        if (this.anims.exists(animKey)) continue
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(key, { start, end: start + 3 }),
          frameRate: 8,
          repeat: -1
        })
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
Edited file
MainScene.ts
+0
-7


  private handleAreaTransition() {
    const worldStore = useWorldStore()
    if (worldStore.currentSceneKey !== SHOP_SCENE_KEY) {
      worldStore.setCurrentScene(SHOP_SCENE_KEY, 'shop')
    }
  }

  public refreshGates() {
Ran npm.cmd run build
Ran npx.cmd vue-tsc -b
Ran git status --short
Ran rg -n "key: SHOP_SCENE_KEY|WorldSimulationController|getWorldSnapshots|scene: \[MainScene, TownScene\]|constructor\(\) \{ super\(\{ key: TOWN_SCENE_KEY \}\) \}|UPDATE_GAME_SCENCE" -S src UPDATE_GAME_SCENCE.md
Mình đã tách kiến trúc scene sang dạng nhiều scene và đặt nền simulation layer theo hướng bạn chọn.

Các thay đổi chính:

Shop giờ chạy bằng src/game/MainScene.ts (line 1) với scene key ShopScene, không còn render Town chung trong cùng world nữa.
Thêm src/game/TownScene.ts (line 1) để quản lý riêng khu Town/Gym exterior, chuyển cảnh qua fadeOut -> wake/launch -> sleep.
Thêm world source of truth tại src/features/world/store/worldStore.ts (line 1) và controller thời gian độc lập tại src/features/world/WorldSimulationController.ts (line 1).
App.vue giờ khởi động simulation controller và cleanup đầy đủ khi unmount tại src/App.vue (line 1).
GameContainer boot cả ShopScene và TownScene tại src/features/shop-ui/components/GameContainer.vue (line 1).
NPCManager và StaffManager đã có snapshot export để đồng bộ trạng thái về Pinia: NPCManager.ts (line 1), StaffManager.ts (line 1).
Mình cũng thêm tài liệu tóm tắt refactor ở UPDATE_GAME_SCENCE.md (line 1).
Mức độ hoàn thành hiện tại:

Scene split đã có.
Time/off-screen simulation foundation đã có.
Player snapshot + scene wake/sleep flow đã có.
2.5D layer/hitbox/shadow/FSM được giữ nguyên.
Chưa chuyển toàn bộ AI NPC/staff sang chạy hoàn toàn trong Pinia; hiện tại mới là lớp nền snapshot + controller để làm tiếp bước sau mà không phá flow cũ.
Kiểm tra:

npx.cmd vue-tsc -b: pass.
npm.cmd run build: fail do môi trường local không load được native Tailwind/Vite dependency (@tailwindcss/oxide..., spawn EPERM), không phải lỗi TypeScript từ phần refactor.
Nếu bạn muốn, bước tiếp theo mình sẽ làm tiếp phần khó nhất: để TownScene và ShopScene đều render actor từ snapshot Pinia thay vì để NPC/staff “sống thật” bên trong Phaser manager như hiện tại.


UPDATE_GAME_SCENCE.md
Document · MD

Open

11 files changed
+885
-109
Undo

Review
UPDATE_GAME_SCENCE.md
src/App.vue
src/features/customer/managers/NPCManager.ts
src/features/shop-ui/components/GameContainer.vue
src/features/staff/managers/StaffManager.ts
src/features/world/WorldSimulationController.ts
src/features/world/constants.ts
src/features/world/store/worldStore.ts
src/game/MainScene.ts
src/game/TownScene.ts
src/game/utils/characterAnimations.ts




8:11 AM
Model changed from GPT-5.4 to GPT-5.3-Codex.
OK tiếp tục 
8:13 AM


Worked for 1m 6s
Mình tiếp tục luôn theo nhịp bạn đã chốt: mình sẽ hoàn thiện nốt phần refactor scene/simulation đang dang dở, dọn sạch lỗi compile còn lại, rồi báo lại trạng thái chạy được của flow ShopScene <-> TownScene. Bước đầu mình sẽ rà lại MainScene sau các patch vừa rồi và chạy type-check lại ngay.


Ran 3 commands
Ran rg -n "MainScene|ShopScene|TownScene|handleAreaTransition|registerCharacterAnimations|TOWN_START_X|useGymStore" src\game\MainScene.ts src\game\TownScene.ts src\features\shop-ui\components\GameContainer.vue src\App.vue
Ran Get-Content src\game\MainScene.ts
Ran npx.cmd vue-tsc -b
Mình thấy type-check đã sạch, nên mình sẽ tiếp tục “cứng hóa” compatibility để không gãy tính năng cũ: đồng bộ lại cờ isPlayerInTown (gym flow cũ đang dùng), và dọn phần tải asset Town còn sót trong ShopScene để tránh side-effect không cần thiết. Sau đó mình chạy check lại một vòng nữa.


Edited 2 files, ran 3 commands
Edited file
MainScene.ts
+3
-2

import { aStarGrid } from '../features/environment/managers/AStarGridManager'
import gymBuildingImg from '../assets/images/gym_building.svg'
import { AppConfig } from './config/AppConfig'
import { registerCharacterAnimations } from './utils/characterAnimations'
import { useGymStore } from '../features/gym/store/gymStore'

    this.load.image(TEX.SIDEWALK_TILE,  sidewalkTileImg)
    this.load.image('gym_building',     gymBuildingImg)
  }
    worldStore.setCurrentScene(SHOP_SCENE_KEY, 'shop')
    useGymStore().setPlayerInTown(false)
    this.playerFSM.resetToIdle(spawn.facing)
      worldStore.finishTransition()
      useGymStore().setPlayerInTown(false)
      this.syncWorldSnapshots()
Edited file
TownScene.ts
+6
-3

      worldStore.setCurrentScene(TOWN_SCENE_KEY, 'town')
      gymStore.setPlayerInTown(true)
    } catch (error) {

    this.syncPlayerSnapshot()
    worldStore.syncPlayerSnapshot(SHOP_SCENE_KEY, { x: spawnX, y: spawnY, facing: 'down' })
    worldStore.beginTransition(TOWN_SCENE_KEY, SHOP_SCENE_KEY, 'shop')
      this.syncPlayerSnapshot()
      worldStore.syncPlayerSnapshot(SHOP_SCENE_KEY, { x: spawnX, y: spawnY, facing: 'down' })
      worldStore.beginTransition(TOWN_SCENE_KEY, SHOP_SCENE_KEY, 'shop')
      useGymStore().setPlayerInTown(false)

      worldStore.finishTransition()
      useGymStore().setPlayerInTown(true)
    } catch (error) {
Ran npx.cmd vue-tsc -b
Ran rg -n "setPlayerInTown|gym_building|SHOP_SCENE_KEY|TOWN_SCENE_KEY" src\game\MainScene.ts src\game\TownScene.ts
Ran git status --short
Mình đã tiếp tục refactor và hoàn thiện thêm phần chuyển scene để giữ tương thích tính năng cũ.

Mình vừa chỉnh:

Đồng bộ lại cờ isPlayerInTown để flow gym/UI cũ không bị lệch state khi qua lại scene:
MainScene.ts (line 221)
TownScene.ts (line 121)
Dọn phần preload asset Town khỏi Shop scene (giảm coupling không cần thiết):
MainScene.ts (line 104)
Giữ bootstrap nhiều scene + simulation controller + snapshot sync như đã làm trước đó:
GameContainer.vue (line 29)
worldStore.ts (line 1)
WorldSimulationController.ts (line 1)
Xác minh:

npx.cmd vue-tsc -b pass.
npm.cmd run build vẫn có thể fail ở máy bạn do native dependency Tailwind/Vite (@tailwindcss/oxide + spawn EPERM), không phải lỗi TypeScript từ refactor.
Bước tiếp theo tự nhiên nhất để đi tiếp đúng mục tiêu “off-screen simulation kiểu Stardew” là:

Tạo WorldActorProjectionManager để TownScene render NPC/Staff từ snapshot Pinia (không gắn trực tiếp vào manager shop).
Chuyển dần schedule/di chuyển NPC-staff sang world controller (Pinia source of truth), Phaser chỉ còn nhiệm vụ “vẽ theo snapshot”.
Tách GymScene độc lập (interior) và giữ TownScene là overworld đúng kiến trúc đa scene.
2 files changed
+9
-5
Undo

Review
src/game/MainScene.ts
src/game/TownScene.ts




8:14 AM
OK
8:30 AM


Worked for 2m 9s
Mình tiếp tục luôn bước kế: mình sẽ thêm WorldActorProjectionManager để TownScene bắt đầu render actor từ snapshot Pinia (không phụ thuộc trực tiếp manager của Shop), rồi nối controller để cập nhật projection an toàn và có cleanup đầy đủ. Sau đó mình sẽ chạy type-check lại ngay.


Ran 4 commands
Ran Get-Content src\features\world\store\worldStore.ts
Ran Get-Content src\features\world\WorldSimulationController.ts
Ran Get-Content src\game\TownScene.ts
Ran Get-Content src\features\world\constants.ts
Mình đang thêm một lớp projection “an toàn không phá gameplay”: actor ở Town sẽ được render từ snapshot ambient trong worldStore (được suy diễn từ dữ liệu shop), chứ không chạm trực tiếp queue/FSM của NPC thật trong Shop. Cách này giúp chúng ta có off-screen feel ngay, nhưng vẫn không đụng luồng nghiệp vụ checkout/trade/battle hiện tại.


Created 1 file, edited 4 files
Edited file
constants.ts
+6
-0

export const TOWN_SCENE_KEY = 'TownScene'
export const TOWN_WORLD_BOUNDS = {
  startX: 3000,
  startY: 0,
  width: 2000,
  height: 1500
} as const

Edited file
worldStore.ts
+65
-1

  staffById: Record<string, StaffWorldSnapshot>
  ambientTownNPCById: Record<string, NPCWorldSnapshot>
  ambientTownStaffById: Record<string, StaffWorldSnapshot>
}
    npcById: {},
    staffById: {}
    staffById: {},
    ambientTownNPCById: {},
    ambientTownStaffById: {}
  }),
        state.playerByScene[sceneKey] ?? DEFAULT_PLAYER_SNAPSHOTS[sceneKey]
    },
    ambientTownNPCs: (state): NPCWorldSnapshot[] => {
      return Object.values(state.ambientTownNPCById)
    },
    ambientTownStaffs: (state): StaffWorldSnapshot[] => {
      return Object.values(state.ambientTownStaffById)
    }

    updateAmbientTownProjection(now: number) {
      const projectedNPCs: Record<string, NPCWorldSnapshot> = {}
      const projectedStaffs: Record<string, StaffWorldSnapshot> = {}

      const townCenterX = 3000 + 1000
      const townCenterY = 750

      const npcSources = Object.values(this.npcById)
        .filter((entry) => entry.area === 'shop')
        .slice(0, 6)

      for (let index = 0; index < npcSources.length; index += 1) {
        const source = npcSources[index]
        const id = `ambient_town_npc_${source.instanceId}`
        const angle = ((now / 10000) + index * 0.9) % (Math.PI * 2)
        const radius = 180 + index * 45

        projectedNPCs[id] = {
          instanceId: id,
          area: 'town',
          x: townCenterX + Math.cos(angle) * radius,
          y: townCenterY + Math.sin(angle * 1.2) * (120 + index * 25),
          state: 'AMBIENT_WALK',
          intent: source.intent,
          lastUpdatedAt: now
        }
      }

      const staffSources = Object.values(this.staffById)
        .filter((entry) => entry.area === 'shop')
        .slice(0, 2)

      for (let index = 0; index < staffSources.length; index += 1) {
        const source = staffSources[index]
        const id = `ambient_town_staff_${source.instanceId}`
        const angle = ((now / 12000) + index * 1.7) % (Math.PI * 2)

        projectedStaffs[id] = {
          instanceId: id,
          area: 'town',
          x: townCenterX + 340 + Math.cos(angle) * 140,
          y: townCenterY - 120 + Math.sin(angle) * 90,
          duty: source.duty,
          state: 'AMBIENT_PATROL',
          lastUpdatedAt: now
        }
      }

      this.ambientTownNPCById = projectedNPCs
      this.ambientTownStaffById = projectedStaffs
    },

    resetWorldState() {
      this.staffById = {}
      this.ambientTownNPCById = {}
      this.ambientTownStaffById = {}
    }
Edited file
WorldSimulationController.ts
+1
-0

      worldStore.advanceSimulation(Date.now())
      worldStore.updateAmbientTownProjection(Date.now())

Created file
WorldActorProjectionManager.ts
+162
-0

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
Edited file
TownScene.ts
+17
-0

import { GAME_BALANCE } from '../config/gameConfig'
import { WorldActorProjectionManager } from '../features/world/managers/WorldActorProjectionManager'

  private townManager!: TownManager
  private projectionManager!: WorldActorProjectionManager
  private gateHintText!: Phaser.GameObjects.Text

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
      this.townManager.initializeTown()
      this.projectionManager = new WorldActorProjectionManager(this)

      this.townManager.update(this.player.x, this.player.y)
      this.projectionManager.update(this.time.now)
      this.updateGateHint()
    this.gateHintText?.destroy()
    this.projectionManager?.destroy()
    this.townManager?.destroy()
Mình đã nối TownScene với projection manager và cho preload sẵn sprite pools NPC/Staff để render actor ambient từ Pinia. Giờ mình sẽ chạy vue-tsc để chốt compile sạch trước khi báo bạn test in-game.


Ran 3 commands
Ran npx.cmd vue-tsc -b
Ran rg -n "WorldActorProjectionManager|ambientTownNPCs|updateAmbientTownProjection|projectionManager" src\features\world src\game\TownScene.ts src\features\world\WorldSimulationController.ts
Ran git status --short
Mình đã tiếp tục và hoàn thành bước “projection từ Pinia sang TownScene” theo hướng an toàn, không phá flow cũ trong Shop.

Các thay đổi mới:

Thêm ambient projection trong world store + simulation tick:
worldStore.ts (line 1)
WorldSimulationController.ts (line 1)
constants.ts (line 1)
Thêm manager render actor ambient cho Town (đọc snapshot từ Pinia, y-sort + shadow + animation + cleanup):
WorldActorProjectionManager.ts (line 1)
Nối manager này vào Town scene và preload sprite pools NPC/Staff:
TownScene.ts (line 1)
Giữ tương thích flow cũ qua cờ isPlayerInTown khi chuyển scene:
MainScene.ts (line 1)
TownScene.ts (line 1)
Kiểm tra:

npx.cmd vue-tsc -b đã pass.
npm run build chưa kiểm lại vì môi trường máy bạn đang có lỗi native Tailwind/Vite trước đó (oxide/EPERM), không liên quan TypeScript refactor.
Nếu bạn muốn, mình làm tiếp ngay bước kế:

Biến ambient projection thành schedule thật theo giờ game (NPC/Staff có hành vi “đi đâu/làm gì” trong town).
Tách tiếp GymScene interior thành scene độc lập đúng kiến trúc 3-scene (Shop/Town/Gym).
5 files changed
+251
-1
Undo

Review
src/features/world/WorldSimulationController.ts
src/features/world/constants.ts
src/features/world/managers/WorldActorProjectionManager.ts
src/features/world/store/worldStore.ts
src/game/TownScene.ts




8:33 AM
OK
8:33 AM


Worked for 1m 34s
Mình tiếp tục luôn bước 1: nâng ambient projection thành schedule theo giờ game thật (không chỉ quay tròn), để Town có cảm giác mô phỏng ngầm rõ hơn như Stardew. Mình sẽ chỉnh trong worldStore + WorldSimulationController, giữ an toàn bằng fallback/try-catch và không đụng nghiệp vụ checkout/trade/battle đang chạy ở Shop.


Ran 5 commands
Ran Get-Content src\features\world\store\worldStore.ts
Ran Get-Content src\features\world\WorldSimulationController.ts
Ran Get-Content src\features\world\constants.ts
Ran Get-Content src\features\customer\store\customerStore.ts
Ran Get-Content src\features\staff\store\staffStore.ts
Mình sẽ nâng hàm updateAmbientTownProjection thành dạng scheduler theo timeInMinutes (chia khung giờ, route rõ ràng, trạng thái rõ ràng), đồng thời giữ fallback nếu thiếu dữ liệu snapshot từ shop. Sau đó mình nối controller truyền game time vào để projection đổi hành vi theo giờ trong ngày.


Edited 3 files
Edited file
worldStore.ts
+192
-40


interface AmbientProjectionInput {
  gameMinute: number
  shopState: 'OPEN' | 'CLOSED'
}

interface PatrolPoint {
  x: number
  y: number
}

const TOWN_PATROL_ROUTES: PatrolPoint[][] = [
  [
    { x: 3210, y: 480 },
    { x: 3550, y: 500 },
    { x: 3890, y: 510 },
    { x: 4210, y: 515 }
  ],
  [
    { x: 3320, y: 760 },
    { x: 3600, y: 780 },
    { x: 3880, y: 760 },
    { x: 4200, y: 745 }
  ],
  [
    { x: 3180, y: 1060 },
    { x: 3500, y: 1040 },
    { x: 3870, y: 1020 },
    { x: 4200, y: 1000 }
  ]
]

const TOWN_IDLE_SPOTS: PatrolPoint[] = [
  { x: 3360, y: 630 },
  { x: 3640, y: 640 },
  { x: 3920, y: 640 },
  { x: 3470, y: 890 },
  { x: 3770, y: 900 },
  { x: 4080, y: 890 }
]

const STAFF_PATROL_SPOTS: PatrolPoint[] = [
  { x: 4310, y: 560 },
  { x: 4380, y: 760 },
  { x: 4310, y: 960 }
]

export const useWorldStore = defineStore('world', {

    updateAmbientTownProjection(now: number) {
      const projectedNPCs: Record<string, NPCWorldSnapshot> = {}
      const projectedStaffs: Record<string, StaffWorldSnapshot> = {}
    updateAmbientTownProjection(now: number, input?: Partial<AmbientProjectionInput>) {
      try {
        const projectionInput: AmbientProjectionInput = {
          gameMinute: normalizeMinute(input?.gameMinute),
          shopState: input?.shopState === 'CLOSED' ? 'CLOSED' : 'OPEN'
        }

        const projectedNPCs: Record<string, NPCWorldSnapshot> = {}
        const projectedStaffs: Record<string, StaffWorldSnapshot> = {}

      const townCenterX = 3000 + 1000
      const townCenterY = 750
        const npcSources = Object.values(this.npcById)
          .filter((entry) => entry.area === 'shop')
          .slice(0, 8)

      const npcSources = Object.values(this.npcById)
        .filter((entry) => entry.area === 'shop')
        .slice(0, 6)
        const fallbackNPCCount = projectionInput.shopState === 'OPEN' ? 4 : 2
        const npcCount = Math.max(npcSources.length, fallbackNPCCount)

      for (let index = 0; index < npcSources.length; index += 1) {
        const source = npcSources[index]
        const id = `ambient_town_npc_${source.instanceId}`
        const angle = ((now / 10000) + index * 0.9) % (Math.PI * 2)
        const radius = 180 + index * 45
        for (let index = 0; index < npcCount; index += 1) {
          const source = npcSources[index]
          const stableSourceId = source?.instanceId ?? `synthetic_${index}`
          const id = `ambient_town_npc_${stableSourceId}`
          const schedulePoint = getTownNPCSchedulePoint(index, now, projectionInput.gameMinute, projectionInput.shopState)

        projectedNPCs[id] = {
          instanceId: id,
          area: 'town',
          x: townCenterX + Math.cos(angle) * radius,
          y: townCenterY + Math.sin(angle * 1.2) * (120 + index * 25),
          state: 'AMBIENT_WALK',
          intent: source.intent,
          lastUpdatedAt: now
          projectedNPCs[id] = {
            instanceId: id,
            area: 'town',
            x: schedulePoint.x,
            y: schedulePoint.y,
            state: schedulePoint.state,
            intent: source?.intent || 'BUY',
            lastUpdatedAt: now
          }
        }
      }

      const staffSources = Object.values(this.staffById)
        .filter((entry) => entry.area === 'shop')
        .slice(0, 2)
        const staffSources = Object.values(this.staffById)
          .filter((entry) => entry.area === 'shop')
          .slice(0, 3)

      for (let index = 0; index < staffSources.length; index += 1) {
        const source = staffSources[index]
        const id = `ambient_town_staff_${source.instanceId}`
        const angle = ((now / 12000) + index * 1.7) % (Math.PI * 2)
        for (let index = 0; index < staffSources.length; index += 1) {
          const source = staffSources[index]
          const id = `ambient_town_staff_${source.instanceId}`
          const schedulePoint = getTownStaffSchedulePoint(index, now, projectionInput.gameMinute)

        projectedStaffs[id] = {
          instanceId: id,
          area: 'town',
          x: townCenterX + 340 + Math.cos(angle) * 140,
          y: townCenterY - 120 + Math.sin(angle) * 90,
          duty: source.duty,
          state: 'AMBIENT_PATROL',
          lastUpdatedAt: now
          projectedStaffs[id] = {
            instanceId: id,
            area: 'town',
            x: schedulePoint.x,
            y: schedulePoint.y,
            duty: source.duty,
            state: schedulePoint.state,
            lastUpdatedAt: now
          }
        }
      }

      this.ambientTownNPCById = projectedNPCs
      this.ambientTownStaffById = projectedStaffs
        this.ambientTownNPCById = projectedNPCs
        this.ambientTownStaffById = projectedStaffs
      } catch (error) {
        console.error('[WorldStore] updateAmbientTownProjection failed:', error)
      }
    },
})

function normalizeMinute(input?: number): number {
  const fallback = 540
  if (!Number.isFinite(input)) return fallback

  const minute = Math.floor(Number(input))
  if (minute < 0) return fallback
  if (minute > 1439) return minute % 1440
  return minute
}

function getTownNPCSchedulePoint(
  index: number,
  now: number,
  gameMinute: number,
  shopState: 'OPEN' | 'CLOSED'
): { x: number; y: number; state: string } {
  const route = TOWN_PATROL_ROUTES[index % TOWN_PATROL_ROUTES.length]
  const routeSpeed = gameMinute >= 1080 ? 0.03 : 0.05
  const routeT = (now * routeSpeed + index * 0.23) / 1000

  if (shopState === 'CLOSED' || gameMinute >= 1200) {
    const idle = TOWN_IDLE_SPOTS[index % TOWN_IDLE_SPOTS.length]
    return {
      x: idle.x + Math.sin(routeT * 0.4) * 10,
      y: idle.y + Math.cos(routeT * 0.3) * 6,
      state: 'AMBIENT_IDLE'
    }
  }

  if (gameMinute < 600) {
    const idle = TOWN_IDLE_SPOTS[(index + 2) % TOWN_IDLE_SPOTS.length]
    return {
      x: idle.x + Math.sin(routeT * 0.7) * 16,
      y: idle.y + Math.cos(routeT * 0.5) * 10,
      state: 'AMBIENT_WARMUP'
    }
  }

  if (gameMinute >= 900 && gameMinute < 1200) {
    const offset = (index % 2 === 0 ? 1 : -1) * 40
    const progress = (now / 1200 + index * 0.19) % route.length
    const current = route[Math.floor(progress)]
    const next = route[(Math.floor(progress) + 1) % route.length]
    const blend = progress - Math.floor(progress)
    return {
      x: lerp(current.x + offset, next.x + offset, blend),
      y: lerp(current.y + 40, next.y + 40, blend),
      state: 'AMBIENT_COMMUTE'
    }
  }

  const progress = (now / 1000 + index * 0.33) % route.length
  const current = route[Math.floor(progress)]
  const next = route[(Math.floor(progress) + 1) % route.length]
  const blend = progress - Math.floor(progress)
  return {
    x: lerp(current.x, next.x, blend),
    y: lerp(current.y, next.y, blend),
    state: 'AMBIENT_PATROL'
  }
}

function getTownStaffSchedulePoint(
  index: number,
  now: number,
  gameMinute: number
): { x: number; y: number; state: string } {
  const base = STAFF_PATROL_SPOTS[index % STAFF_PATROL_SPOTS.length]
  const t = now / 1000 + index * 0.5

  if (gameMinute < 540) {
    return {
      x: base.x,
      y: base.y + 10,
      state: 'AMBIENT_OFF_DUTY'
    }
  }

  if (gameMinute >= 1200) {
    return {
      x: base.x - 40 + Math.sin(t * 0.2) * 8,
      y: base.y - 30 + Math.cos(t * 0.2) * 8,
      state: 'AMBIENT_WRAP_UP'
    }
  }

  return {
    x: base.x + Math.sin(t * 0.6) * 30,
    y: base.y + Math.cos(t * 0.5) * 22,
    state: 'AMBIENT_STAFF_PATROL'
  }
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha
}
Edited file
WorldSimulationController.ts
+6
-2

      const worldStore = useWorldStore()
      const now = Date.now()

      worldStore.advanceSimulation(Date.now())
      worldStore.updateAmbientTownProjection(Date.now())
      worldStore.advanceSimulation(now)
      worldStore.updateAmbientTownProjection(now, {
        gameMinute: gameStore.timeInMinutes,
        shopState: gameStore.shopState
      })

Edited file
UPDATE_GAME_SCENCE.md
+1
-0

- Đây là bước nền để vòng sau chuyển tiếp logic schedule/NPC AI tính toán ngầm hoàn toàn sang store/controller.
- `worldStore` đã có ambient scheduler theo `timeInMinutes` để mô phỏng NPC/Staff xuất hiện và di chuyển ở Town theo khung giờ, thay vì chuyển động vòng tròn giả lập.

Mình đã xong phần scheduler theo giờ game cho ambient actor ở Town (có khung giờ sáng/đang mở cửa/đi làm về/cuối ngày, có state rõ ràng), và đã nối controller truyền timeInMinutes vào. Mình chạy check compile ngay để đảm bảo an toàn trước khi bạn test runtime.


Ran 3 commands
Ran rg -n "updateAmbientTownProjection\(|AMBIENT_|gameMinute|shopState" src\features\world\store\worldStore.ts src\features\world\WorldSimulationController.ts
Ran npx.cmd vue-tsc -b
Ran git status --short
Mình đã làm xong bước “scheduler theo giờ game” cho mô phỏng ngầm ở Town.

Điểm mới chính:

ambient projection giờ không còn chạy vòng tròn cố định nữa, mà chạy theo timeInMinutes + shopState, có trạng thái rõ ràng theo khung giờ:
NPC: AMBIENT_WARMUP, AMBIENT_PATROL, AMBIENT_COMMUTE, AMBIENT_IDLE
Staff: AMBIENT_OFF_DUTY, AMBIENT_STAFF_PATROL, AMBIENT_WRAP_UP
Logic này nằm ở worldStore.ts (line 199) và có fallback đầy đủ nếu thiếu input/snapshot.
WorldSimulationController đã truyền gameStore.timeInMinutes + gameStore.shopState vào scheduler:
WorldSimulationController.ts (line 1)
Xác minh:

npx.cmd vue-tsc -b pass.
Nếu bạn đồng ý, mình làm tiếp bước kế ngay: kết nối scheduler này để khi đổi scene, một phần NPC/staff thực sự “di cư” giữa shop/town (không chỉ ambient projection), nhưng vẫn đảm bảo các flow cũ như checkout/tradein/grading/battle không bị gãy.


UPDATE_GAME_SCENCE.md
Document · MD

Open

3 files changed
+199
-42
Undo

Review
UPDATE_GAME_SCENCE.md
src/features/world/WorldSimulationController.ts
src/features/world/store/worldStore.ts




8:34 AM
OK
8:45 AM


Worked for 2m 16s
Mình sẽ làm theo hướng an toàn nhưng tiến thêm một nấc “di cư thật trong dữ liệu”: tạo cơ chế gán nguồn NPC/Staff từ shop sang town theo khung giờ với tính ổn định theo ID (không nhảy loạn mỗi tick), rồi phản chiếu qua projection ở Town. Cách này không đụng AI checkout/trade trong Shop nên không gãy gameplay hiện có, nhưng mô phỏng ngầm sẽ có tính “đi làm/đi về” rõ ràng hơn.


Edited 1 file
Edited file
worldStore.ts
+143
-9

  ambientTownStaffById: Record<string, StaffWorldSnapshot>
  townAssignedNPCBySourceId: Record<string, number>
  townAssignedStaffBySourceId: Record<string, number>
}
    ambientTownNPCById: {},
    ambientTownStaffById: {}
    ambientTownStaffById: {},
    townAssignedNPCBySourceId: {},
    townAssignedStaffBySourceId: {}
  }),
      return Object.values(state.ambientTownStaffById)
    },
    assignedTownNPCSourceIds: (state): string[] => {
      return Object.keys(state.townAssignedNPCBySourceId)
    },
    assignedTownStaffSourceIds: (state): string[] => {
      return Object.keys(state.townAssignedStaffBySourceId)
    }
          .filter((entry) => entry.area === 'shop')
          .slice(0, 8)
          .slice(0, 12)

        const desiredTownNPCCount = getDesiredTownNPCCount(
          projectionInput.gameMinute,
          projectionInput.shopState,
          npcSources.length
        )
        const assignedNPCSourceIds = reconcileTownAssignments(
          this.townAssignedNPCBySourceId,
          npcSources.map((entry) => entry.instanceId),
          desiredTownNPCCount,
          now
        )

        const fallbackNPCCount = projectionInput.shopState === 'OPEN' ? 4 : 2
        const npcCount = Math.max(npcSources.length, fallbackNPCCount)
        const fallbackNPCCount = Math.max(desiredTownNPCCount, 1)
        const effectiveTownNPCCount = Math.max(assignedNPCSourceIds.length, fallbackNPCCount)

        for (let index = 0; index < npcCount; index += 1) {
          const source = npcSources[index]
        for (let index = 0; index < effectiveTownNPCCount; index += 1) {
          const assignedSourceId = assignedNPCSourceIds[index]
          const source = npcSources.find((entry) => entry.instanceId === assignedSourceId) ?? npcSources[index]
          const stableSourceId = source?.instanceId ?? `synthetic_${index}`
          .filter((entry) => entry.area === 'shop')
          .slice(0, 3)
          .slice(0, 6)

        const desiredTownStaffCount = getDesiredTownStaffCount(
          projectionInput.gameMinute,
          projectionInput.shopState,
          staffSources.length
        )
        const assignedStaffSourceIds = reconcileTownAssignments(
          this.townAssignedStaffBySourceId,
          staffSources.map((entry) => entry.instanceId),
          desiredTownStaffCount,
          now
        )

        for (let index = 0; index < staffSources.length; index += 1) {
          const source = staffSources[index]
        for (let index = 0; index < assignedStaffSourceIds.length; index += 1) {
          const assignedSourceId = assignedStaffSourceIds[index]
          const source = staffSources.find((entry) => entry.instanceId === assignedSourceId) ?? staffSources[index]
          if (!source) continue
          const id = `ambient_town_staff_${source.instanceId}`
      this.ambientTownStaffById = {}
      this.townAssignedNPCBySourceId = {}
      this.townAssignedStaffBySourceId = {}
    }

function getDesiredTownNPCCount(
  gameMinute: number,
  shopState: 'OPEN' | 'CLOSED',
  availableCount: number
): number {
  const cap = Math.max(0, Math.min(availableCount, 8))
  if (cap === 0) return 0

  if (shopState === 'CLOSED' || gameMinute >= 1200) {
    return Math.min(2, cap)
  }

  if (gameMinute < 540) {
    return Math.min(1, cap)
  }

  if (gameMinute < 720) {
    return Math.min(2, cap)
  }

  if (gameMinute < 1020) {
    return Math.min(3, cap)
  }

  return Math.min(4, cap)
}

function getDesiredTownStaffCount(
  gameMinute: number,
  shopState: 'OPEN' | 'CLOSED',
  availableCount: number
): number {
  const cap = Math.max(0, Math.min(availableCount, 3))
  if (cap === 0) return 0

  if (shopState === 'CLOSED') return Math.min(1, cap)
  if (gameMinute < 600) return 0
  if (gameMinute < 1020) return Math.min(1, cap)
  return Math.min(2, cap)
}

function reconcileTownAssignments(
  assignmentMap: Record<string, number>,
  availableSourceIds: string[],
  targetCount: number,
  now: number
): string[] {
  const MIN_SWITCH_INTERVAL_MS = 12000
  const availableSet = new Set(availableSourceIds)

  for (const sourceId of Object.keys(assignmentMap)) {
    if (!availableSet.has(sourceId)) {
      delete assignmentMap[sourceId]
    }
  }

  const currentAssignments = Object.keys(assignmentMap)
    .sort((a, b) => assignmentMap[a] - assignmentMap[b])

  if (targetCount <= 0) {
    for (const sourceId of currentAssignments) {
      if (now - assignmentMap[sourceId] >= MIN_SWITCH_INTERVAL_MS) {
        delete assignmentMap[sourceId]
      }
    }
    return []
  }

  const result = [...currentAssignments]

  if (result.length > targetCount) {
    while (result.length > targetCount) {
      const candidate = result[result.length - 1]
      if (now - (assignmentMap[candidate] ?? now) < MIN_SWITCH_INTERVAL_MS) break
      delete assignmentMap[candidate]
      result.pop()
    }
  }

  if (result.length < targetCount) {
    const candidates = availableSourceIds
      .filter((sourceId) => !result.includes(sourceId))
      .sort()

    while (result.length < targetCount && candidates.length > 0) {
      const next = candidates.shift()
      if (!next) break
      assignmentMap[next] = now
      result.push(next)
    }
  }

  return result
}

function normalizeMinute(input?: number): number {
Mình đã thêm cơ chế assignment ổn định theo ID + cooldown chuyển vùng để tránh NPC/Staff “teleport tâm linh” giữa các tick. Giờ mình chạy type-check và rà nhanh để đảm bảo không có lỗi logic do helper mới.


Edited 1 file, ran 3 commands
Ran npx.cmd vue-tsc -b
Ran rg -n "townAssignedNPCBySourceId|reconcileTownAssignments|getDesiredTownNPCCount|getDesiredTownStaffCount|assignedTownNPCSourceIds" src\features\world\store\worldStore.ts
Ran Get-Content src\features\world\store\worldStore.ts | Select-Object -Skip 170 -First 240
Edited file
worldStore.ts
+1
-1


        const fallbackNPCCount = Math.max(desiredTownNPCCount, 1)
        const fallbackNPCCount = desiredTownNPCCount
        const effectiveTownNPCCount = Math.max(assignedNPCSourceIds.length, fallbackNPCCount)
Mình đã chỉnh thêm để tránh spawn NPC “ảo” khi không có nguồn từ shop: Town giờ chỉ render số lượng đúng theo assignment/scheduler thực. Mình chạy check lại lần cuối để khóa độ ổn định.


Ran 2 commands
Ran npx.cmd vue-tsc -b
Ran git status --short
Đã xong bước nâng cấp scheduler “di cư theo giờ” cho Town.

Kết quả chính:

worldStore giờ có cơ chế gán ổn định nguồn NPC/Staff từ shop sang town theo khung giờ, có cooldown đổi vùng để tránh nhảy loạn:
worldStore.ts (line 1)
Scheduler dùng timeInMinutes + shopState để quyết định số lượng và trạng thái theo ngày:
NPC: warmup/patrol/commute/idle
Staff: off-duty/staff-patrol/wrap-up
WorldSimulationController đã truyền context giờ game thật vào scheduler:
WorldSimulationController.ts (line 1)
Có fallback + try/catch, và mình đã khóa trường hợp sinh actor “ảo” khi không có nguồn từ shop.
Xác minh:

npx.cmd vue-tsc -b pass.
Bước tiếp theo nếu bạn muốn mình làm ngay:

Đồng bộ assignment này ngược lại vào ShopScene để actor đã “đi town” tạm thời không còn hiện ở shop (migrate trực quan hai chiều).
Tách GymScene interior thành scene độc lập và nối transition Town -> Gym -> Town chuẩn fade/sleep/wake.
1 file changed
Undo

Review
src/features/world/store/worldStore.ts




8:47 AM
OK
9:00 AM


Worked for 2m 36s
Mình sẽ chốt bước “sync ngược về Shop” theo hướng không phá gameplay: trước mắt áp dụng migrate thật cho staff off-duty (an toàn), còn NPC sẽ giữ dạng projection ở Town để tránh gãy các flow checkout/trade đang chạy. Mình đang sửa StaffManager + MainScene + worldStore để staff được gán sang Town thì sẽ tạm ẩn/đóng băng ở Shop, và quay lại Shop khi bị unassign.


Ran 4 commands
Context automatically compacted
Mình tiếp tục bước tiếp theo theo hướng an toàn: đồng bộ ngược từ worldStore về ShopScene cho phần staff off-duty trước, để tạo cảm giác “đi giữa scene” nhưng không ảnh hưởng các luồng nghiệp vụ chính. Mình sẽ đọc lại MainScene và StaffManager, rồi patch trực tiếp kèm cleanup đầy đủ.


Ran 4 commands
Mình đã định vị được các điểm hook quan trọng trong MainScene (wake/sleep/sync/teleport). Bước kế tiếp mình sẽ thêm cơ chế “ẩn staff off-duty trong Shop nếu đã được gán sang Town” bằng một lớp lọc nhẹ trong StaffManager, rồi nối MainScene để áp dụng mỗi lần sync.


Ran 3 commands
Mình sẽ patch 3 điểm nhỏ nhưng quan trọng:

worldStore chỉ chọn staff off-duty cho ambient Town,
StaffManager thêm cơ chế hide/show an toàn cho staff đang “được mô phỏng ở Town”,
MainScene áp dụng danh sách đó mỗi lần sync để giữ tính nhất quán khi chuyển scene.

Edited 3 files, ran 2 commands
Edited file
worldStore.ts
+1
-1

        const staffSources = Object.values(this.staffById)
          .filter((entry) => entry.area === 'shop')
          .filter((entry) => entry.area === 'shop' && entry.duty === 'NONE')
          .slice(0, 6)
Ran rg -n "export class StaffManager|syncWorkers\(|public update\(|public destroy\(|getWorldSnapshots\(" src/features/staff/managers/StaffManager.ts
Ran Get-Content -Path 'src/features/staff/managers/StaffManager.ts' -TotalCount 760
Edited file
StaffManager.ts
+42
-1

  private agents: Map<string, StaffAgent> = new Map()
  private projectedAwayStaffIds: Set<string> = new Set()

      agent.sync(w.duty, w.targetDeskId)
      this.applyProjectedVisibilityForAgent(agent)
    })
    const delta = this.scene.game.loop.delta
    this.agents.forEach(agent => agent.update(time, delta))
    this.agents.forEach(agent => {
      if (!agent.sprite.visible) return
      agent.update(time, delta)
    })
  }
    this.agents.clear()
    this.projectedAwayStaffIds.clear()
  }
  }

  public setProjectedAwayStaffIds(instanceIds: string[]) {
    try {
      const next = new Set((instanceIds || []).filter((id) => typeof id === 'string' && id.length > 0))
      this.projectedAwayStaffIds = next
      this.agents.forEach((agent) => this.applyProjectedVisibilityForAgent(agent))
    } catch (error) {
      console.error('[StaffManager] setProjectedAwayStaffIds failed:', error)
    }
  }

  private applyProjectedVisibilityForAgent(agent: StaffAgent) {
    try {
      const shouldProjectAway = agent.duty === 'NONE' && this.projectedAwayStaffIds.has(agent.instanceId)
      const shouldBeVisible = !shouldProjectAway
      const body = agent.sprite.body as Phaser.Physics.Arcade.Body | undefined

      agent.sprite.setVisible(shouldBeVisible)
      agent.statusText.setVisible(shouldBeVisible)
      if (agent.shadow) {
        agent.shadow.setVisible(shouldBeVisible)
      }

      if (body) {
        body.enable = shouldBeVisible
      }

      if (!shouldBeVisible) {
        agent.locomotion.stop()
        agent.sprite.setVelocity(0, 0)
      }
    } catch (error) {
      console.error('[StaffManager] applyProjectedVisibilityForAgent failed:', error)
    }
  }
}
Edited file
MainScene.ts
+2
-0

      const worldStore = useWorldStore()
      const projectedAwayStaffIds = worldStore.assignedTownStaffSourceIds ?? []

      worldStore.syncStaffSnapshots('shop', this.staffManager?.getWorldSnapshots?.() ?? [])
      this.staffManager?.setProjectedAwayStaffIds?.(projectedAwayStaffIds)
    } catch (error) {
Mình đã nối xong luồng hide/show staff off-duty theo assignment Town. Giờ mình chạy type-check để đảm bảo không vỡ luồng cũ (staff duty, restock, checkout).


Ran 5 commands
Ran npm.cmd run -s typecheck
Ran npx.cmd vue-tsc -b
Ran git status --short
Ran rg -n "assignedTownStaffSourceIds|syncWorldSnapshots\(|setProjectedAwayStaffIds" src/game/MainScene.ts src/features/staff/managers/StaffManager.ts src/features/world/store/worldStore.ts
Ran rg -n "entry\.area === 'shop' && entry\.duty === 'NONE'" src/features/world/store/worldStore.ts
Đã tiếp tục refactor theo hướng an toàn và không đụng luồng nghiệp vụ cũ:

Mình đã ràng buộc ambient Town chỉ lấy staff off-duty (duty === 'NONE') trong worldStore.ts (line 257), tránh việc cashier/restocker bị “clone” sang Town.
Mình thêm cơ chế hide/show staff theo assignment Town trong StaffManager.ts (line 595), có try/catch, tắt body va chạm và dừng locomotion khi bị ẩn để tránh leak/tốn update.
Mình nối MainScene để áp dụng danh sách projected mỗi lần sync snapshot trong MainScene.ts (line 516).
Xác minh: npx vue-tsc -b đã pass.

Nếu bạn đồng ý, bước tiếp theo mình sẽ làm tương tự cho NPC theo chế độ “safe rollout” (chỉ NPC idle/ambient trước, chưa đụng luồng trade/battle).

3 files changed
+45
-2
Undo

Review
src/features/staff/managers/StaffManager.ts
  private environmentManager: EnvironmentManager
  public deliveryManager: DeliveryManager
  private agents: Map<string, StaffAgent> = new Map()
  private projectedAwayStaffIds: Set<string> = new Set()

  constructor(scene: Phaser.Scene, environmentManager: EnvironmentManager, deliveryManager: DeliveryManager) {
    this.scene = scene
        this.agents.set(w.instanceId, agent)
      }
      agent.sync(w.duty, w.targetDeskId)
      this.applyProjectedVisibilityForAgent(agent)
    })
  }

  public update(time: number) {
    const delta = this.scene.game.loop.delta
    this.agents.forEach(agent => agent.update(time, delta))
    this.agents.forEach(agent => {
      if (!agent.sprite.visible) return
      agent.update(time, delta)
    })
  }

  public destroy() {
    this.agents.forEach(a => a.destroy())
    this.agents.clear()
    this.projectedAwayStaffIds.clear()
  }

  public getWorldSnapshots(): StaffWorldSnapshot[] {
      lastUpdatedAt: now
    }))
  }

  public setProjectedAwayStaffIds(instanceIds: string[]) {
    try {
      const next = new Set((instanceIds || []).filter((id) => typeof id === 'string' && id.length > 0))
      this.projectedAwayStaffIds = next
      this.agents.forEach((agent) => this.applyProjectedVisibilityForAgent(agent))
    } catch (error) {
      console.error('[StaffManager] setProjectedAwayStaffIds failed:', error)
    }
  }

  private applyProjectedVisibilityForAgent(agent: StaffAgent) {
    try {
      const shouldProjectAway = agent.duty === 'NONE' && this.projectedAwayStaffIds.has(agent.instanceId)
      const shouldBeVisible = !shouldProjectAway
      const body = agent.sprite.body as Phaser.Physics.Arcade.Body | undefined

      agent.sprite.setVisible(shouldBeVisible)
      agent.statusText.setVisible(shouldBeVisible)
      if (agent.shadow) {
        agent.shadow.setVisible(shouldBeVisible)
      }

      if (body) {
        body.enable = shouldBeVisible
      }

      if (!shouldBeVisible) {
        agent.locomotion.stop()
        agent.sprite.setVelocity(0, 0)
      }
    } catch (error) {
      console.error('[StaffManager] applyProjectedVisibilityForAgent failed:', error)
    }
  }
}
src/features/world/store/worldStore.ts
        }

        const staffSources = Object.values(this.staffById)
          .filter((entry) => entry.area === 'shop')
          .filter((entry) => entry.area === 'shop' && entry.duty === 'NONE')
          .slice(0, 6)

        const desiredTownStaffCount = getDesiredTownStaffCount(
src/game/MainScene.ts
  private syncWorldSnapshots() {
    try {
      const worldStore = useWorldStore()
      const projectedAwayStaffIds = worldStore.assignedTownStaffSourceIds ?? []

      worldStore.syncPlayerSnapshot(SHOP_SCENE_KEY, {
        x: this.player?.x ?? 0,

      worldStore.syncNPCSnapshots('shop', this.npcManager?.getWorldSnapshots?.() ?? [])
      worldStore.syncStaffSnapshots('shop', this.staffManager?.getWorldSnapshots?.() ?? [])
      this.staffManager?.setProjectedAwayStaffIds?.(projectedAwayStaffIds)
    } catch (error) {
      console.error('[MainScene] Failed to sync world snapshots:', error)
    }




9:03 AM
OK
