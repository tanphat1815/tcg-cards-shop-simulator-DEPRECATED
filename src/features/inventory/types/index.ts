export interface CardData {
  id: string
  name: string
  hp: number
  type: string
  rarity: string
  marketPrice: number
  imageKey: string

  // ── NEW: Trạng thái grading (chỉ áp dụng cho thẻ đang pending) ──
  /** True khi thẻ đang được gửi đi chấm điểm (KHÔNG dùng cho slab đã trả về) */
  isGrading?: boolean
  /** Ngày in-game mà thẻ sẽ được trả về (currentDay + 2) */
  gradingReturnDay?: number
}

/**
 * Thẻ đã được chấm điểm (Graded Slab).
 * Đây là entity RIÊNG, không trộn với personalBinder thường.
 * Mỗi slab có slabId unique — cùng 1 cardId có thể có nhiều slab với grade khác nhau.
 */
export interface GradedCard {
  slabId: string          // "slab_<timestamp>_<rand>"
  cardId: string          // ID gốc của thẻ từ API
  grade: number           // 1..10
  /** Hệ số nhân giá so với marketPrice gốc (đã lookup từ GRADE_TABLE) */
  priceMultiplier: number
  /** Ngày nhận được slab (để sort "mới nhất") */
  gradedOnDay: number
}

/**
 * Một bưu kiện đang chờ Player mở (spawn trong Phaser).
 */
export interface GradingPackage {
  packageId: string
  slabs: GradedCard[]    // Một bưu kiện có thể chứa nhiều slab (nếu Player gửi nhiều ngày trước)
  /** Tọa độ spawn trong shop (gần cửa hoặc quầy) */
  x: number
  y: number
}
