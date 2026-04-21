export interface StockItemInfo {
  id: string;
  name: string;
  buyPrice: number;
  sellPrice: number;
  basePrice?: number; // True EV (Expected Value) base price from Cards
  rarityBonusPercent?: number; // Price increment percentage based on Series Rarity/Hotness
  requiredLevel: number;
  type: 'pack' | 'box';
  volume: number; // Volume slot capacity (1 slot = MAX_VOLUME 32)
  contains?: { itemId: string; amount: number }; // Used for unboxing
  description: string;
  sourceSetId?: string; // Store original set ID from API for pack opening
  generation?: string; // e.g. "GENERATION IV"
}

// --- ECONOMY CONFIG ---
export const MARKUP_PACK = 1.6; // 60% profit
export const MARKUP_BOX = 1.4;  // 40% profit

export const STOCK_ITEMS: Record<string, StockItemInfo> = {
  // Empty for now, will be populated by API or defined here
};

// List of Set IDs that should not appear in the shop (e.g. empty card lists or broken metadata)
export const SET_BLACKLIST = [
  'wp', // Wizards Black Star Promos (empty card list in TCGdex)
  'exu', // Unseen Forces Unown Collection Booster Box (can not find image),
  'basep', // Wizards Black Star Promos Booster Pack,
  'box_dpp', // DP Black Star Promos Booster Box (64 Packs),
  'pack_dp1', // DP Black Star Promos Booster Pack,
  'box_bwp', // BW Black Star Promos Booster Box (64 Packs),
  'pack_bwp', // BW Black Star Promos Booster Pack,
  'box_rc', // Radiant Collection Booster Box (64 Packs),
  'pack_bw11', // Radiant Collection Booster Pack,
  'pack_g1', 
  'box_g1',
  'pack_xy0',
  'box_xy0',
  'pack_xyp',
  'box_xyp',
  'pack_xya',
  'box_xya',
];
