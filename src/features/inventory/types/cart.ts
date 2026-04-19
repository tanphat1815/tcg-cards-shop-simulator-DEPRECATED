export interface CartItem {
  itemId: string          // key trong shopItems
  name: string
  type: 'pack' | 'box'
  unitPrice: number       // buyPrice tại thời điểm thêm vào giỏ
  sellPrice: number       // sellPrice để hiện margin tooltip
  basePrice: number       // EV gốc
  rarityBonusPercent: number
  quantity: number
  imageUrl: string        // getPackVisuals(sourceSetId).front
  sourceSetId?: string
}

export interface CartState {
  items: CartItem[]
  isOpen: boolean
  addModalItemId: string | null   // ID của item đang mở AddToCartModal
}
