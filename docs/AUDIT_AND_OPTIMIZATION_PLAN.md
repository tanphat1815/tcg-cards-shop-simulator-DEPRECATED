# AUDIT & OPTIMIZATION PLAN
Dự án: Pokemon TCG Shop Simulator (Webgame 2.5D)
Mục tiêu: Đạt chuẩn Architecture & Performance tối ưu chuẩn Principal level.

Bản hướng dẫn chi tiết này dành cho quá trình Refactoring và Tối ưu hóa dự án. Coder (Junior) cần tuân thủ tuyệt đối từng bước.

---

## 1. Tinh gọn & Loại bỏ Code Thừa (DRY & Dead Code)

* **Vấn đề**: Logic format tiền tệ bị phân mảnh. Mặc dù đã có file tiện ích `src/features/shared/utils/currency.ts` (chứa hàm `formatUSD`), nhưng rất nhiều Components vẫn tự ý gọi thẳng biến kết hợp với dấu `$` và `.toFixed(2)` (ví dụ: `Tổng giá trị Binder: \${{ totalEstimatedValue }}` thay vì dùng util). Điều này gây rủi ro hiển thị sai khi thay đổi quy chuẩn tiền tệ sau này.
* **Cách giải quyết**:
  1. Mở file `src/features/shared/utils/currency.ts`. Đảm bảo các hàm sau tồn tại và xuất ra hoạt động tốt: `formatUSD(price: number): string`.
  2. Mở file `src/features/inventory/components/BinderMenu.vue`, xóa hardcode `$`, xóa `.toFixed(2)` trong computed `totalEstimatedValue`. Cập nhật computed để trả về kết quả kiểu Number. Lúc hiển thị trên template trực tiếp chạy qua `formatUSD(totalEstimatedValue)`.
  3. Tìm kiếm và làm tương tự cho các file `EndOfDayModal.vue`, `SetPriceModal.vue`, `OnlineShopMenu.vue`, `CheckoutModal.vue`.
  4. Lọc bỏ các block CSS dead code, css class dư thừa trong các Vue component (nếu không còn thẻ HTML nào tham chiếu).

---

## 2. Tối ưu Hiệu năng Vue 3 & Pinia (Reactivity Bottlenecks)

* **Vấn đề**: Các danh sách hiển thị lớn (Ví dụ như hàng trăm thẻ bài trong `BinderMenu.vue` hay Card/Slab List) dùng `v-for` thông thường. Hệ quả là mỗi khi State nhỏ lẻ bên ngoài thay đổi, Vue 3 phải re-render lại cả DOM tree nặng nề này.
* **Cách giải quyết (Static List Optimization)**:
  1. Trong file `src/features/inventory/components/BinderMenu.vue`:
     Quét quanh phần `<div v-for="entry in paginatedStandardCards" :key="entry.id" ...>`. 
     Thêm chỉ thị `v-memo="[entry.qty, entry.id]"` trực tiếp vào vòng lặp này. Điều này báo cho Vue chỉ re-render một dòng Component TcgCard khi ID hoặc Số lượng thẻ thực sự có biến động.
  2. Tương tự cho `<div v-for="entry in paginatedGradedSlabs">`, thêm chỉ thị `v-memo="[entry.slab.slabId, entry.slab.priceMultiplier]"`.
  3. Quét toàn bộ Pinia array push (đặc biệt trong `customerStore.ts`). Đảm bảo mảng Phaser Object không bao giờ bị ném vào root state của Vue3/Pinia (chúng ta đang dùng string `instanceId` là đúng, hãy giữ vững nguyên tắc này và rà soát các branch khác xem có lọt Sprite nào vào Store không).

---

## 3. Tối ưu Hiệu năng Phaser 3 (Memory Leaks & Game Loop)

* **Vấn đề**: `NPCManager.ts` và `StaffManager.ts` liên tục sinh ra NPC mới và giết (destroy) chúng.
  + Việc gọi liên tục khởi tạo `this.scene.physics.add.sprite(...)` và gỡ `sprite.destroy()` gây hao tổn Memory (Garbage Collection nhảy múa liên tục) làm FPS bị drop dần theo thời gian.
  + Hệ thống Tween (hiển thị popup 🃏 icon) có thể bị kẹt và văng lỗi Null/Undefined nếu Sprite bị gỡ quá đột ngột khi Tween chưa chạy hết.
* **Cách giải quyết**:
  1. Áp dụng Object Pooling (Tái chế Object) trong `NPCManager.ts`:
     Tạo cấu trúc nhóm `this.npcGroup = scene.physics.add.group()`. 
     Thay vì `this.scene.physics.add.sprite()`, sử dụng cơ chế `const sprite = this.npcGroup.get(...)`.
     Khi một NPC rời shop (`LEAVE`), không dùng `destroy()`, hãy reset lại tọa độ và gọi `sprite.setActive(false).setVisible(false)`.
  2. Dọn lính chốt (Zombie Tweens): Trong hàm `destroy()` của `CustomerAgent` (Tệp `CustomerFSM.ts`), vòng qua mảng theo dõi thuộc tính (như `data.tradeIcon`) và đảm bảo gọi `scene.tweens.killTweensOf(target)` trước khi cho chúng ngừng.

---

## 4. Bổ sung Edge Cases & Fallbacks (Chống Crash Game)

* **Vấn đề**: Thiếu cơ chế xử lý lỗi sâu (Edge Cases):
  1. Hình ảnh thẻ bài: Nếu asset 404 thì hiện dấu bể/rách mặc định của trình duyệt, làm webgame thiếu chuyên nghiệp.
  2. Kẹt đường NPC (Anti-stuck): Trong FSM (`RestockerMoveToBoxState`, `QueuingState`...), dù dùng thư viện `A* Grid`, vẫn có rủi ro tọa độ NPC trả về khoảng cách cố định (Bị va chạm, Collision box dội lại).
  3. Undefined Property Crashes trong khi traverse cấu trúc Deep Object Inventory.
* **Cách giải quyết**:
  1. Sửa tệp `TcgCard.vue`, `SlabDisplay.vue` và các thành phần giao diện hình ảnh: Bổ sung event `@error="onImageError"` vào thẻ `<img>` và chuyển biến url sang một đường link `FALLBACK_IMAGE_URL` (ví dụ `no_image.png`). Nếu cần, hiện thêm Skeleton CSS lúc loading.
  2. Triển khai Anti-stuck ở FSM `CustomerFSM.ts` và `StaffAgent`: Trong phương thức `onUpdate`, theo dõi tọa độ X, Y hiện tại so với 3 giây trước. Nếu delta X/Y < 1 pixel và hành động đang là `isMoving`, ép FSM thực thi hàm reset (`fsm.transition('WANDER')` cho NPC hoặc `RESTING` cho Staff) kèm console warning để thoát kẹt.
  3. Toàn bộ chuỗi truy vấn Object sâu trong `inventoryStore.ts`, `furnitureStore.ts`: Thay bằng Optional Chaining `?.` và Nullish Coalescing `??` thay vì bọc `if/else` chắp vá. Ví dụ: `tier.customPriceMap?.[picked.cardId] ?? 0`.

---

## 5. Quy hoạch Global / Hardcoded Values

* **Vấn đề**: Các giá trị cân bằng game (Game Balance Variables) bị giấu (hardcode) sâu khắp nơi ở các file Manager.
  Ví dụ: `CustomerFSM.ts` dòng 460 có `const fee = 5`, hay tỷ lệ spawn Intent (Wander 70%, Play 25%, Sell 5%) giấu ở hàm `spawnNPC()` của `NPCManager.ts`, hay `PlayerFSM.ts` set tốc độ 160.
* **Cách giải quyết**:
  1. Tạo hoặc cập nhật tệp chung `src/config/gameConfig.ts` chứa các block hằng số chuẩn như:
     ```typescript
     export const GAME_BALANCE = {
       NPC_INTENT_CHANCES: { BUY: 0.70, PLAY: 0.25, SELL: 0.05 },
       MAX_WAITING_CUSTOMERS: 10,
       ENTRY_EVENT_FEE: 5,
       NPC_BOREDOM_MS: 45000,
       PLAYER_BASE_SPEED: 160,
     }
     ```
  2. Quét qua `CustomerFSM.ts` và `NPCManager.ts`, `MainScene.ts`... Xóa các con số hardcode và import mảng `GAME_BALANCE` vào để so sánh thay thế. Điều này giúp Principal/Game Designer có một nơi duy nhất để Upscale hoặc tinh chỉnh độ khó về sau.

---
**Lời nhắn gửi Junior Coder:** 
Xin hãy đọc kỹ từng đoạn và modify đúng file chuẩn như đã chỉ định. Bạn không được tự ý xóa các hàm, chỉ di chuyển nội dung và điều chỉnh logic fallback cần thiết!
