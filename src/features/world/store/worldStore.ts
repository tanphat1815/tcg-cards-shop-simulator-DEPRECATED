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
  ambientTownNPCById: Record<string, NPCWorldSnapshot>
  ambientTownStaffById: Record<string, StaffWorldSnapshot>
  townAssignedNPCBySourceId: Record<string, number>
  townAssignedStaffBySourceId: Record<string, number>
}

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
  state: (): WorldState => ({
    currentSceneKey: SHOP_SCENE_KEY,
    currentArea: 'shop',
    previousSceneKey: null,
    isTransitioning: false,
    lastSimulationAt: Date.now(),
    playerByScene: { ...DEFAULT_PLAYER_SNAPSHOTS },
    npcById: {},
    staffById: {},
    ambientTownNPCById: {},
    ambientTownStaffById: {},
    townAssignedNPCBySourceId: {},
    townAssignedStaffBySourceId: {}
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
    },
    ambientTownNPCs: (state): NPCWorldSnapshot[] => {
      return Object.values(state.ambientTownNPCById)
    },
    ambientTownStaffs: (state): StaffWorldSnapshot[] => {
      return Object.values(state.ambientTownStaffById)
    },
    assignedTownNPCSourceIds: (state): string[] => {
      return Object.keys(state.townAssignedNPCBySourceId)
    },
    assignedTownStaffSourceIds: (state): string[] => {
      return Object.keys(state.townAssignedStaffBySourceId)
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

    updateAmbientTownProjection(now: number, input?: Partial<AmbientProjectionInput>) {
      try {
        const projectionInput: AmbientProjectionInput = {
          gameMinute: normalizeMinute(input?.gameMinute),
          shopState: input?.shopState === 'CLOSED' ? 'CLOSED' : 'OPEN'
        }

        const projectedNPCs: Record<string, NPCWorldSnapshot> = {}
        const projectedStaffs: Record<string, StaffWorldSnapshot> = {}

        const npcSources = Object.values(this.npcById)
          .filter((entry) => entry.area === 'shop')
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

        const fallbackNPCCount = desiredTownNPCCount
        const effectiveTownNPCCount = Math.max(assignedNPCSourceIds.length, fallbackNPCCount)

        for (let index = 0; index < effectiveTownNPCCount; index += 1) {
          const assignedSourceId = assignedNPCSourceIds[index]
          const source = npcSources.find((entry) => entry.instanceId === assignedSourceId) ?? npcSources[index]
          const stableSourceId = source?.instanceId ?? `synthetic_${index}`
          const id = `ambient_town_npc_${stableSourceId}`
          const schedulePoint = getTownNPCSchedulePoint(index, now, projectionInput.gameMinute, projectionInput.shopState)

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

        const staffSources = Object.values(this.staffById)
          .filter((entry) => entry.area === 'shop' && entry.duty === 'NONE')
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

        for (let index = 0; index < assignedStaffSourceIds.length; index += 1) {
          const assignedSourceId = assignedStaffSourceIds[index]
          const source = staffSources.find((entry) => entry.instanceId === assignedSourceId) ?? staffSources[index]
          if (!source) continue
          const id = `ambient_town_staff_${source.instanceId}`
          const schedulePoint = getTownStaffSchedulePoint(index, now, projectionInput.gameMinute)

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

        this.ambientTownNPCById = projectedNPCs
        this.ambientTownStaffById = projectedStaffs
      } catch (error) {
        console.error('[WorldStore] updateAmbientTownProjection failed:', error)
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
      this.ambientTownNPCById = {}
      this.ambientTownStaffById = {}
      this.townAssignedNPCBySourceId = {}
      this.townAssignedStaffBySourceId = {}
    }
  }
})

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
