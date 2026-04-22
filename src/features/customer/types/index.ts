export type NPCState =
  | 'SPAWN'
  | 'WANDER'
  | 'SEEK_ITEM'
  | 'INTERACT'
  | 'GO_CASHIER'
  | 'WAITING'
  | 'LEAVE'
  | 'WANT_TO_PLAY'
  | 'SEEK_TABLE'
  | 'PLAYING'
  | 'TRADE_IN'          // NPC đang di chuyển tới quầy thu ngân để bán thẻ
  | 'TRADE_IN_WAITING'  // NPC đứng tại quầy, đợi Player click tương tác
  | 'GO_CASHIER_EVENT'   // ── NEW: Đi thanh toán phí event ──


export type CustomerIntent = 'BUY' | 'PLAY' | 'SELL'

export interface Customer {
  sprite: Phaser.Physics.Arcade.Sprite;
  state: NPCState;
  timer: number;
  targetX: number;
  targetY: number;
  targetPrice: number;
  intent?: CustomerIntent;
  assignedTableId?: string | null;
  seatIndex?: number | null;
  spawnTime: number;         // Time when NPC entered shop
  lastDecisionTime: number;  // For periodic AI re-scans
  statusText?: Phaser.GameObjects.Text; // Overhead popover
  lastMoveAttemptTime?: number; // For stuck recovery logic
  instanceId: string; // Persistent ID for this NPC
  checkedShelfIds: string[]; // Remember shelves visited but empty
  searchStartTime?: number; // Time when NPC started searching for a table/shelf

  // ── NEW: Trade-In fields ─────────────────────────────────
  /** Card ID mà NPC mang đến bán (lấy từ apiStore.flatCardMap) */
  tradeCardId?: string;
  /** Icon 🃏 lơ lửng trên đầu NPC (destroy khi rời shop) */
  tradeIcon?: Phaser.GameObjects.Text;

  // ── NEW: Passive Event fields ─────────────────────────────────
  /** Thời điểm (Date.now()) bắt đầu ngồi chơi — để tính phí event */
  playStartTimestamp?: number;
  /** Số tiền sẽ thanh toán khi tới quầy */
  eventFeeOwed?: number;
}


