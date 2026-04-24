# UPDATE_GAME_SCENCE

## Mục tiêu của vòng refactor này

- Tách `ShopScene` và `TownScene` thành hai `Phaser.Scene` độc lập.
- Dời đồng hồ game sang lớp simulation độc lập để scene không còn là nguồn thật của thời gian.
- Đặt nền `Pinia world store` để snapshot player/NPC/staff có nơi lưu tập trung, phục vụ off-screen simulation ở các bước sau.
- Giữ nguyên các tính năng hiện có trong shop: staff, NPC, trade-in, grading, battle, build/edit, grid movement, collision.

## Những gì đã được triển khai

### 1. Scene split

- Scene chính hiện dùng key `ShopScene`.
- Có thêm `TownScene` riêng.
- Chuyển cảnh qua `fadeOut -> wake/launch scene đích -> sleep scene hiện tại -> fadeIn`.
- Shop không còn render Town/Gym nền trong cùng một scene nữa.

### 2. World source of truth

- Thêm `worldStore`:
  - `currentSceneKey`
  - `currentArea`
  - `isTransitioning`
  - `playerByScene`
  - `npcById`
  - `staffById`
- Các scene sync snapshot player vào Pinia.
- `ShopScene` sync snapshot NPC/staff lên Pinia theo chu kỳ nhẹ.

### 3. Off-screen simulation foundation

- Đồng hồ game đã chuyển sang `WorldSimulationController`.
- Controller này chạy độc lập với scene lifecycle, vì vậy khi đi Town thì thời gian game vẫn tiếp tục chạy.
- Đây là bước nền để vòng sau chuyển tiếp logic schedule/NPC AI tính toán ngầm hoàn toàn sang store/controller.
- `worldStore` đã có ambient scheduler theo `timeInMinutes` để mô phỏng NPC/Staff xuất hiện và di chuyển ở Town theo khung giờ, thay vì chuyển động vòng tròn giả lập.

### 4. 2.5D architecture

- Phần 2.5D hiện có trong project vẫn được giữ nguyên:
  - `Wall Front / Wall Top`
  - `Y-sort`
  - `Foot collider`
  - `Drop shadow`
  - `PlayerFSM`

## Kiến trúc sau refactor

```text
Pinia
  ├─ gameStore          -> economy / time / facade
  ├─ worldStore         -> active scene / player snapshots / actor snapshots
  ├─ gymStore           -> gym leaders / overlay state
  └─ các domain store khác

Vue
  ├─ App.vue
  ├─ GameContainer.vue
  └─ UI overlay / modal / HUD

Phaser
  ├─ ShopScene
  └─ TownScene
```

## File mới / thay đổi chính

- `src/features/world/constants.ts`
- `src/features/world/store/worldStore.ts`
- `src/features/world/WorldSimulationController.ts`
- `src/game/TownScene.ts`
- `src/game/utils/characterAnimations.ts`
- `src/game/MainScene.ts`
- `src/features/shop-ui/components/GameContainer.vue`
- `src/App.vue`
- `src/features/customer/managers/NPCManager.ts`
- `src/features/staff/managers/StaffManager.ts`

## Điều chưa làm trong vòng này

- Chưa chuyển toàn bộ FSM NPC/Staff sang chạy hoàn toàn trong Pinia.
- Chưa spawn/render NPC thường trú trong TownScene theo schedule.
- Chưa tách `GymScene` riêng; hiện Gym interaction vẫn đi qua `TownScene + gymStore + Vue overlay`.

## Hướng bước tiếp theo

- Đưa scheduler NPC/staff sang world controller.
- Tạo actor renderer mỏng cho từng scene, chỉ đọc snapshot từ Pinia.
- Tách tiếp `GymScene` nếu muốn render gym interior độc lập như Shop/Town.
