/** Loại buff/nerf mà Event có thể áp dụng */
export type EventEffectTarget =
  | 'ENERGY_TYPE'    // Hệ: Fire, Water, Grass, Earth, Wind (alias Lightning)
  | 'RARITY'         // Common, Uncommon, Rare, Epic, Legend
  | 'EDITION'        // 1st Edition, Unlimited, Shadowless
  | 'BORDER'         // Silver border, Gold border, Holo border
  | 'CARD_TYPE'      // EX, V, VMAX, VSTAR, Full Art, Holo/Foil
  | 'RANDOM'         // Chọn ngẫu nhiên khi event start

export interface EventEffect {
  target: EventEffectTarget
  /** Giá trị cụ thể để match.
   * Ví dụ: target='ENERGY_TYPE', value='Fire' → tất cả thẻ Fire được buff.
   * Nếu target='RANDOM' → value ignored, sẽ random khi apply. */
  value: string
  /** Hệ số nhân giá. > 1.0 là Buff, < 1.0 là Nerf. */
  multiplier: number
}

export interface GameEvent {
  id: string
  name: string
  format: string           // Hiển thị thêm (vd: 'Pauper Format')
  description: string
  /** Số lượng khách đã từng ngồi chơi cần để unlock */
  unlockAtTotalPlayers: number
  /** Chi phí duy trì mỗi ngày */
  dailyCost: number
  /** Tiền thu mỗi giờ từ mỗi ghế có khách ngồi */
  hourlyFee: number
  /** Các hiệu ứng lên giá thẻ */
  effects: EventEffect[]
  /** Emoji/icon hiển thị UI */
  icon: string
}

export const GAME_EVENTS: GameEvent[] = [
  // ── 1. STANDARD — mặc định free ──
  {
    id: 'standard',
    name: 'Standard',
    format: 'Standard Format',
    description: 'Giải đấu chuẩn mở ngay từ ngày đầu. Không có buff đặc biệt.',
    unlockAtTotalPlayers: 0,
    dailyCost: 0,
    hourlyFee: 7,
    icon: '🎴',
    effects: [
      { target: 'RANDOM', value: '', multiplier: 1.2 },    // Random buff
      { target: 'RANDOM', value: '', multiplier: 0.85 },   // Random nerf
    ],
  },

  // ── 2. PAUPER — Common buff ──
  {
    id: 'pauper',
    name: 'Pauper',
    format: 'Pauper Format',
    description: 'Chỉ dùng thẻ phổ thông. Giá thẻ Common tăng, Rare+ giảm.',
    unlockAtTotalPlayers: 50,
    dailyCost: 50,
    hourlyFee: 8.13,
    icon: '🌱',
    effects: [
      { target: 'RARITY', value: 'Common',   multiplier: 1.5 },
      { target: 'RARITY', value: 'Rare',     multiplier: 0.7 },
      { target: 'RARITY', value: 'Epic',     multiplier: 0.6 },
      { target: 'RARITY', value: 'Legend',   multiplier: 0.5 },
    ],
  },

  // ── 3-6. ELEMENTAL CUPS — 4 hệ ──
  {
    id: 'fire_cup',
    name: 'Fire Cup',
    format: 'Elemental Format',
    description: 'Thẻ hệ Lửa được ưu tiên. Hệ Đất bị giảm.',
    unlockAtTotalPlayers: 100,
    dailyCost: 70,
    hourlyFee: 10,
    icon: '🔥',
    effects: [
      { target: 'ENERGY_TYPE', value: 'Fire',     multiplier: 1.5 },
      { target: 'ENERGY_TYPE', value: 'Fighting', multiplier: 0.7 },  // Earth alias
    ],
  },
  {
    id: 'earth_cup',
    name: 'Earth Cup',
    format: 'Elemental Format',
    description: 'Thẻ hệ Đất được ưu tiên. Hệ Nước bị giảm.',
    unlockAtTotalPlayers: 150,
    dailyCost: 70,
    hourlyFee: 10,
    icon: '⛰️',
    effects: [
      { target: 'ENERGY_TYPE', value: 'Fighting', multiplier: 1.5 },  // Earth alias
      { target: 'ENERGY_TYPE', value: 'Water',    multiplier: 0.7 },
    ],
  },
  {
    id: 'water_cup',
    name: 'Water Cup',
    format: 'Elemental Format',
    description: 'Thẻ hệ Nước được ưu tiên. Hệ Gió bị giảm.',
    unlockAtTotalPlayers: 200,
    dailyCost: 70,
    hourlyFee: 10,
    icon: '💧',
    effects: [
      { target: 'ENERGY_TYPE', value: 'Water',     multiplier: 1.5 },
      { target: 'ENERGY_TYPE', value: 'Lightning', multiplier: 0.7 },  // Wind alias
    ],
  },
  {
    id: 'wind_cup',
    name: 'Wind Cup',
    format: 'Elemental Format',
    description: 'Thẻ hệ Gió được ưu tiên. Hệ Lửa bị giảm.',
    unlockAtTotalPlayers: 250,
    dailyCost: 70,
    hourlyFee: 10,
    icon: '💨',
    effects: [
      { target: 'ENERGY_TYPE', value: 'Lightning', multiplier: 1.5 },  // Wind alias
      { target: 'ENERGY_TYPE', value: 'Fire',      multiplier: 0.7 },
    ],
  },

  // ── 7. VINTAGE — 1st Edition buff ──
  {
    id: 'vintage',
    name: 'Vintage',
    format: 'Vintage Format',
    description: 'Thẻ 1st Edition được ưu tiên. Một số viền bị nerf.',
    unlockAtTotalPlayers: 500,
    dailyCost: 200,
    hourlyFee: 15,
    icon: '📜',
    effects: [
      { target: 'EDITION', value: '1st Edition',      multiplier: 1.8 },
      { target: 'BORDER',  value: 'Shadowless',       multiplier: 0.75 },
    ],
  },

  // ── 8. SILVER LEGACY — Silver border ──
  {
    id: 'silver_legacy',
    name: 'Silver Legacy',
    format: 'Legacy Format',
    description: 'Thẻ viền Bạc được đánh giá cao.',
    unlockAtTotalPlayers: 750,
    dailyCost: 250,
    hourlyFee: 18.94,
    icon: '🥈',
    effects: [
      { target: 'BORDER', value: 'Silver', multiplier: 1.7 },
    ],
  },

  // ── 9. GOLD STAR ──
  {
    id: 'gold_star',
    name: 'Gold Star',
    format: 'Premium Format',
    description: 'Thẻ viền Vàng là vua.',
    unlockAtTotalPlayers: 1000,
    dailyCost: 300,
    hourlyFee: 22.82,
    icon: '🥇',
    effects: [
      { target: 'BORDER', value: 'Gold', multiplier: 2.0 },
    ],
  },

  // ── 10. EX BATTLE ──
  {
    id: 'ex_battle',
    name: 'EX Battle',
    format: 'EX Format',
    description: 'Thẻ EX làm chủ đấu trường.',
    unlockAtTotalPlayers: 1500,
    dailyCost: 400,
    hourlyFee: 28.14,
    icon: '⚔️',
    effects: [
      { target: 'CARD_TYPE', value: 'EX', multiplier: 1.8 },
    ],
  },

  // ── 11. FULL ART ──
  {
    id: 'full_art',
    name: 'Full Art',
    format: 'Art Format',
    description: 'Thẻ Full Art được săn đón.',
    unlockAtTotalPlayers: 2500,
    dailyCost: 500,
    hourlyFee: 35.14,
    icon: '🎨',
    effects: [
      { target: 'CARD_TYPE', value: 'Full Art', multiplier: 2.2 },
    ],
  },

  // ── 12. HOLO HEAVEN ──
  {
    id: 'holo_heaven',
    name: 'Holo Heaven',
    format: 'Foil Format',
    description: 'Thẻ Holo/Foil lên ngôi.',
    unlockAtTotalPlayers: 5000,
    dailyCost: 700,
    hourlyFee: 45.78,
    icon: '✨',
    effects: [
      { target: 'CARD_TYPE', value: 'Holo', multiplier: 2.5 },
    ],
  },
]

/** Helper: lookup by id */
export function getEventById(id: string | null): GameEvent | null {
  if (!id) return null
  return GAME_EVENTS.find(e => e.id === id) ?? null
}

/** Helper: lookup events đã mở khoá dựa trên totalPlayersHosted */
export function getUnlockedEvents(totalPlayers: number): GameEvent[] {
  return GAME_EVENTS.filter(e => e.unlockAtTotalPlayers <= totalPlayers)
}
