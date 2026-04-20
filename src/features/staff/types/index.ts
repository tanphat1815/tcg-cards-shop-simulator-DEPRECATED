export type WorkerDuty = 'RESTOCK' | 'CHECKOUT' | 'CLEAN' | 'NONE'
export type RestockMode = 'AUTO' | 'REFILL_ONLY' | 'FILL_EMPTY'

export type RestockSubState =
  | 'IDLE'                    // Rảnh, về IdleZone
  | 'FETCH_FROM_DELIVERY'     // Đi nhặt thùng ở bãi giao hàng
  | 'CARRY_TO_STORAGE'        // Vác thùng đến kệ kho
  | 'FIND_SHELF'              // Tìm kệ bán cần hàng
  | 'FETCH_FROM_STORAGE'      // Đến kệ kho lấy hàng
  | 'CARRY_TO_SELLING_SHELF'  // Mang hàng ra kệ bán
  | 'DIRECT_RESTOCK'          // Bypass kho: Vác thẳng thùng ra kệ bán
  | 'WAITING_FOR_SPACE'       // Tất cả kệ đều đầy, chờ tại IdleZone
  | 'GO_HOME'                 // Tan ca, đi về cổng

export interface HiredWorker {
  instanceId: string;
  dataId: string;
  duty: WorkerDuty;
  targetDeskId?: string | null;
  restockMode: RestockMode;
  /**
   * Status for Phaser visuals
   */
  x: number;
  y: number;
  state: 'IDLE' | 'WORKING' | 'MOVING';
}
