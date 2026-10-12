# TCG Shop Simulator - Godot Migration Technical Specification

Tài liệu này được biên soạn dành cho quá trình chuyển đổi dự án từ **Vue.js + Phaser 3** sang **Godot Engine**. Nó mô tả chi tiết logic nghiệp vụ, cấu trúc dữ liệu và toán học nền tảng nhằm giúp AI xây dựng lại trên Godot mà không làm mất tính năng.

---

## 1. Kiến trúc dữ liệu (Data Schema)

Dự án hiện tại dùng **Pinia** (Vue.js) làm hệ quản trị state toàn cục (Global State Management). Khi chuyển sang Godot, có thể sử dụng các Singleton/Autoload kết hợp với Custom Resources.

### 1.1 Các State Store Chính
*   **`inventoryStore`**: 
    *   `shopInventory`: Kho chứa hàng hóa của cửa hàng (Dict mapping `itemId` -> `quantity`).
    *   `personalBinder`: Bộ sưu tập thẻ bài cá nhân (Dict mapping `cardId` -> `quantity`).
    *   Lưu trữ state khi "Xé Pack" (Gacha).
*   **`apiStore`**:
    *   Cache các bộ bài (`sets`) và định nghĩa giá cả (`shopItems`). 
    *   Sử dụng SQLite (`sql.js`) ngầm để truy vấn thẻ bài. 
    *   Có một `flatCardMap` (O(1) lookup) để truy xuất dữ liệu thẻ nhanh.
*   **`statsStore`**: Quản lý EXP (Kinh nghiệm), Cấp độ (Level), Tiền (Money), và Setting phím điều khiển.
*   **`worldStore`**: Quản lý trạng thái giữa các Scene (Shop vs Town), lưu vị trí nhân vật (Player Snapshot) khi chuyển cảnh.
*   **`gameStore`**: Quản lý chế độ (Build Mode, Edit Mode, Paused).

### 1.2 Hằng số & Cấu hình (Constants)
*   **`AppConfig.ts`**: Cấu hình Camera zoom, kích thước Isometric Tile (64x32), config của Matter.js Physics (Friction, Body Size) và Depth Offsets.

---

## 2. Logic tính năng (Feature Logic)

### 2.1 Xé Pack Thẻ (Gacha Mechanics)
*   **Nơi xử lý**: `inventoryStore.tearPack(packId)` và `apiStore.getWeightedRandomCardsFromSet()`
*   **Input**: `packId` (Chuỗi ID của gói thẻ).
*   **Output**: Trừ 1 pack trong kho, thêm 6 thẻ vào `personalBinder`, cộng EXP. Cập nhật state UI.
*   **Step-by-step**:
    1.  Kiểm tra số lượng pack trong `shopInventory`.
    2.  Gọi SQLite query: `SELECT * FROM cards WHERE set_id = ? ORDER BY RANDOM() LIMIT 6`. (Lấy ngẫu nhiên cực nhanh ở tầng DB).
    3.  **Thuật toán Rarity Sort**: Chấm điểm (Rank) cho thẻ dựa vào độ hiếm (VD: `Ghost Rare` = 10, `Common` = 0). Sau đó sắp xếp mảng tăng dần theo Rank. Thẻ hiếm nhất sẽ luôn nằm ở cuối (index 5) để tạo kịch tính lúc bốc bài.
    4.  Cộng thẻ vào `personalBinder`. Thưởng XP tùy vào độ hiếm (Rare trở lên thì thưởng nhiều hơn).
*   **Ràng buộc**: Người chơi phải có đủ pack. Thẻ được lưu dựa trên ID thẻ tĩnh.

### 2.2 Hệ Thống Tìm Đường (A* Pathfinding của NPC)
*   **Nơi xử lý**: `AStarGridManager.ts`
*   **Input**: `fromWorld` (Tọa độ bắt đầu), `toWorld` (Tọa độ đích).
*   **Output**: Mảng các điểm (Waypoints) để NPC di chuyển.
*   **Step-by-step**:
    1.  Bản đồ được chia thành Grid, kích thước 16px/ô (`GRID_TILE = 16`). Mọi vật cản (Bàn, Kệ, Tường) sẽ chặn các ô này (`walkable = false`).
    2.  Sử dụng thuật toán **A* (A-Star)**.
    3.  **Heuristic**: Sử dụng khoảng cách Manhattan: `|x1 - x2| + |y1 - y2|`.
    4.  **Chuyển động 4 hướng**: NPC chỉ đi Lên, Xuống, Trái, Phải (Không đi chéo).
    5.  **Performance Optimization**: Mảng `open` thay vì dùng hàm `sort()` gây chậm, được thay bằng cách duyệt và chèn tay (Sorted Insertion) dựa theo `f-cost`.
*   **Ràng buộc ngầm cực kì quan trọng (Zone-aware snap)**: Nếu điểm Start hoặc Goal vô tình rớt vào ô bị kẹt (`walkable = false`), thuật toán sẽ dùng BFS (Breadth-First Search) để tìm ô trống gần nhất *trong cùng một khu vực* (VD: Trong cửa hàng hoặc Ngoài vỉa hè) để làm điểm bắt đầu/đích mới, chống kẹt NPC.

---

## 3. Hệ thống Isometric & Tọa độ

Dự án có khả năng chuyển đổi giữa Oblique (2.5D top-down) và Isometric thuần. Ở mode Isometric:
*   **Tỷ lệ Lưới (Grid Ratio)**: 2:1 (`TILE_WIDTH = 64`, `TILE_HEIGHT = 32`).
*   **Toán Học Chuyển Đổi**:
    *   `screenToWorld` (Màn hình sang Grid):
        *   `worldX = (dx / 32 + dy / 16) / 2`
        *   `worldY = (dy / 16 - dx / 32) / 2`
    *   `worldToScreen` (Grid sang Màn hình):
        *   `screenX = OriginX + (col - row) * 32`
        *   `screenY = OriginY + (col + row) * 16`
*   **Z-Index / Layers (Render Order)**:
    *   Do đặc thù 2D Isometric giả 3D, thứ tự vẽ phải chuẩn để các vật thể che khuất nhau đúng logic.
    *   **Công thức độ sâu**: `Depth = Base_Depth + (Grid_Col + Grid_Row) + Z_Offset`
    *   `Z_Offset` rất quan trọng: 
        *   `PLAYER` = +20, `FURNITURE` = +10.
        *   `WALL_TOP` = +2000 (Trần/Nắp tường luôn ưu tiên đè lên đầu nhân vật để tạo cảm giác bị tường che đi khuất).

---

## 4. Luồng Game (Game Flow) & Giao Tiếp

### 4.1 Vòng Lặp Game (MainScene `update`)
1.  Bỏ qua update di chuyển nếu đang ở chế độ `Build/Edit Mode` (Khóa nhân vật).
2.  Update trạng thái `npcManager`, `furnitureManager`, `deliveryManager`.
3.  Cập nhật vị trí bóng đổ (Shadow) bám theo nhân vật.
4.  Cập nhật Z-Index liên tục cho nhân vật dựa trên tọa độ Y (Oblique) hoặc tọa độ Grid (Isometric).

### 4.2 Chuyển Cảnh (Scene Transitions)
*   Sử dụng `worldStore` lưu lại vị trí (x, y) và hướng nhìn hiện tại. Phát Signal ngưng hoạt động scene cũ và gọi `WAKE` cho scene mới. 

### 4.3 Giao tiếp giữa UI và Game (Event Bus)
*   Phaser là engine game, Vue là lớp UI phủ lên trên. Cả hai giao tiếp qua một `EventBus` độc lập.
*   **Phaser -> Vue**: Báo cáo sự kiện game như NPC thanh toán `customer:paid`, kệ trống hàng `shelf:empty`.
*   **Vue -> Phaser**: Trả về quyết định của người chơi `trade:result`, hoặc update trạng thái shop mở/đóng cửa `shop:stateChanged`.
*   Ngoài ra, Phaser theo dõi các thay đổi của Store thông qua hàm `store.$subscribe` (Pinia observer) để vẽ lại đồ vật khi data đổi.

---

## 5. Những Cảnh Báo Cho Quá Trình Chuyển Đổi Sang Godot

*Khi cung cấp bản phân tích này cho AI bên Godot, hãy dặn nó đặc biệt lưu ý:*

1.  **Hệ thống Tọa độ (Coordinate System):**
    *   BỎ QUA toàn bộ các đoạn code tính toán `(col - row) * 32` của Phaser. Thay vào đó, hãy dùng **Node `TileMap` (Godot 3.x) hoặc `TileMapLayer` (Godot 4.x)** với chế độ `Isometric`.
    *   Tính năng Z-Index: Tận dụng thuộc tính `Y Sort Enabled` của Godot trên các Node (hoặc `TileMap` Y-Sort) thay vì tự tính công thức thủ công. Điều này giải quyết bài toán che khuất dễ dàng.
2.  **Node-based vs Component-based:**
    *   Không còn khái niệm "Sprite" và "Collider" rời rạc. Một đồ nội thất/kệ hàng sẽ là một Scene đuôi `.tscn` gồm `StaticBody2D` (vật cản), `Sprite2D` (ảnh), và `CollisionPolygon2D` (hitbox). 
    *   Dùng `CharacterBody2D` cho Player/NPC để di chuyển và trượt theo tường một cách tự nhiên.
3.  **Tín hiệu (Signals):**
    *   Xóa bỏ `EventBus` của Javascript. Tại Godot, dùng Autoload/Singleton tên là `EventBus` và định nghĩa `signal customer_paid(price, instance_id)`.
    *   Đảm bảo tuân thủ nguyên tắc: *"Call down, Signal up"*.
4.  **Quản lý Tài nguyên (Resources):**
    *   Không quản lý Cards và Shop Items bằng object JSON hay SQLite cục bộ của Javascript.
    *   Tạo các Custom `Resource` (tệp `.tres`) trong Godot để đại diện cho `Card`, `BoosterPack`.
    *   Viết Tool script bằng GDScript để đọc JSON/DB cũ và tự động generate ra các tệp `.tres` này.
5.  **Chú ý Pathfinding & Rarity:**
    *   Tại Godot, sử dụng hệ thống **NavigationRegion2D** hoặc **AStarGrid2D** có sẵn của Godot (Cực kỳ mạnh mẽ cho grid Isometric). Đừng bê y nguyên code thuật toán bên JS qua sẽ bị chậm.
    *   Thuật toán Rarity Weight (chọn thẻ ngẫu nhiên và xếp thẻ hiếm nhất ở cuối mảng) PHẢI được giữ nguyên cấu trúc logic ở GDScript. Xử lý kịch tính gacha này nằm ở logic hàm `tearPack()`.
