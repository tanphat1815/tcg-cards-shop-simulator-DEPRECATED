export type DeliveryBoxType = 'pack' | 'box' | 'furniture'

export interface PendingDeliveryItem {
  itemId: string
  name: string
  type: DeliveryBoxType
  quantity: number
  imageUrl: string
  furnitureId?: string    // chỉ dùng nếu type === 'furniture'
  sourceSetId?: string    // ID của set (vd: 'base1' cho Base Set)
}

export interface DeliveryBox {
  id: string              // unique per box instance
  itemId: string
  name: string
  type: DeliveryBoxType
  quantity: number        // số lượng trong thùng này
  phaserSpriteKey?: string // 'box_sprite' hoặc furniture sprite key
}

export interface SetPriceTarget {
  shelfId: string
  tierIndex: number
  itemId: string
  name: string
  imageUrl: string
  currentPrice: number    // giá đang set
  marketPrice: number     // market price từ shopItems.sellPrice
  buyPrice: number        // giá nhập (để tính profit)
}
