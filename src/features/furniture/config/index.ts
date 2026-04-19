export type FurnitureRole = 'selling' | 'storage' | 'table' | 'cashier'

export interface FurnitureItemInfo {
  id: string;
  name: string;
  buyPrice: number;
  requiredLevel: number;
  capacityStr: string;
  description: string;
  /** Số tầng của kệ hàng (Ví dụ: 3 cho kệ đơn, 4 cho kệ đôi) */
  numTiers?: number;
  /** Sức chứa tối đa của mỗi tầng (Ví dụ: 16 cho kệ đơn, 32 cho kệ đôi) */
  slotsPerTier?: number;
  /** Vai trò mặc định khi đặt furniture này */
  role?: FurnitureRole;
}

export const FURNITURE_ITEMS: Record<string, FurnitureItemInfo> = {
  'shelf_single': {
    id: 'shelf_single',
    name: 'Single Sided Shelf',
    buyPrice: 300,
    requiredLevel: 3,
    capacityStr: '48 Slots (3x16)',
    description: 'Kệ gỗ 1 mặt tiêu chuẩn. NPCs có thể mua hàng từ kệ này.',
    numTiers: 3,
    slotsPerTier: 16,
    role: 'selling'
  },
  'shelf_double': {
    id: 'shelf_double',
    name: 'Double Sided Shelf',
    buyPrice: 750,
    requiredLevel: 11,
    capacityStr: '128 Slots (4x32)',
    description: 'Kệ trung tâm 2 mặt cao cấp. Sinh lời cực mạnh.',
    numTiers: 4,
    slotsPerTier: 32,
    role: 'selling'
  },
  'storage_shelf': {
    id: 'storage_shelf',
    name: 'Storage Shelf',
    buyPrice: 150,
    requiredLevel: 1,
    capacityStr: '12 Box Slots (3x4)',
    description: 'Kệ kho đơn giản. Dùng để cất thùng hàng. NPCs KHÔNG mua từ đây.',
    numTiers: 3,
    slotsPerTier: 4,
    role: 'storage'
  },
  'play_table': {
    id: 'play_table',
    name: 'Play Table',
    buyPrice: 400,
    requiredLevel: 5,
    capacityStr: '2 Players',
    description: 'Bàn chơi bài cho khách hàng. Tạo XP thụ động khi có người thi đấu.',
    role: 'table'
  },
  'cashier_desk': {
    id: 'cashier_desk',
    name: 'Cashier Desk',
    buyPrice: 500,
    requiredLevel: 1,
    capacityStr: '1 Staff',
    description: 'Quầy thu ngân tiêu chuẩn. Nơi khách mang hàng tới thanh toán.',
    role: 'cashier'
  }
};
