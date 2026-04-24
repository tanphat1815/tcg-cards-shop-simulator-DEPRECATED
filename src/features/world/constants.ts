export const SHOP_SCENE_KEY = 'ShopScene'
export const TOWN_SCENE_KEY = 'TownScene'
export const TOWN_WORLD_BOUNDS = {
  startX: 3000,
  startY: 0,
  width: 2000,
  height: 1500
} as const

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
