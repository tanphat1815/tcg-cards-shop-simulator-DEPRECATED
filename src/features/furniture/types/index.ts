export type ShelfRole = 'selling' | 'storage' | 'display_case'

export interface ShelfTier {
  itemId: string | null;  // Which item fills this tier (null = empty, all slots same type)
  slots: (string | null)[];  // Each slot: itemId or null
  maxSlots: number;          // 32 for packs, 4 for boxes
  /**
   * ── Chỉ dùng cho display_case ──
   * Giá Player tự set cho mỗi cardId trưng bày trên tầng này.
   * Nếu null → dùng marketPrice mặc định.
   */
  customPriceMap?: Record<string, number>;
}

export interface ShelfData {
  id: string;
  furnitureId: string; // ID from FURNITURE_ITEMS
  x: number;
  y: number;
  tiers: ShelfTier[]; // 3 tiers
  /** Vai trò của kệ: 'selling' = bán hàng + NPCs mua được, 'storage' = kho, NPCs KHÔNG mua */
  role: ShelfRole;
}

export interface PlayTableData {
  id: string;
  furnitureId: string;
  x: number;
  y: number;
  occupants: (string | null)[]; // instanceIds of NPCs [seat0, seat1]
  matchStartedAt: number | null; // global game time / timestamp
  /** Góc xoay của bàn (0: Ngang, 90: Dọc) */
  rotation?: number;
}

export interface CashierData {
  id: string;
  furnitureId: string;
  x: number;
  y: number;
}
