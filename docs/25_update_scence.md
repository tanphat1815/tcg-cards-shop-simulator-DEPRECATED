Hãy đóng vai là một Senior Game Architect và Lead Developer với chuyên môn sâu sắc về Phaser 3, Vue 3 (Composition API), và Pinia.

Tôi đang phát triển một dự án game "TCG Card Shop Simulator" đồ họa pixel 2.5D. Mục tiêu của tôi là tái cấu trúc (refactor) dự án để đạt được cảm giác không gian, cơ chế chuyển cảnh, và hệ thống mô phỏng NPC mượt mà, chuyên nghiệp như tựa game Stardew Valley.

Dưới đây là các file source code hiện tại của tôi (sẽ được đính kèm ở cuối). Hãy đọc thật kỹ, hiểu cách chúng đang tương tác với nhau trước khi làm bất cứ điều gì.

⚠️ QUY TẮC LÀM VIỆC TỐI THƯỢNG (BẮT BUỘC TUÂN THỦ):
Không giả định file/hàm cụ thể từ trước: Vì bạn đang đọc source code của tôi lần đầu, hãy phân tích cấu trúc hiện tại và tự quyết định logic mới nên được đặt ở đâu, gán vào tính năng nào, file nào là hợp lý nhất.

Không viết code vắn tắt: Tuyệt đối KHÔNG dùng //... existing code... hay // phần này giữ nguyên. Khi tôi yêu cầu viết code cho một file, phải viết ra toàn bộ file đó từ dòng đầu đến dòng cuối để tôi chỉ việc copy/paste.

An toàn & Chống Crash (Fallback): Mọi logic xử lý dữ liệu phức tạp (nhất là data từ Pinia đưa vào Phaser) phải được bọc trong try/catch. Luôn có fallback logic (ví dụ: nếu không tìm thấy tọa độ sinh ra NPC, hãy dùng tọa độ mặc định 0,0).

Tối ưu Vòng lặp 60FPS: Trong hàm update() của Phaser, tuyệt đối TRÁNH các thao tác nặng như tạo/hủy object liên tục, lặp qua mảng dữ liệu khổng lồ, hoặc render text. Chỉ dùng update() cho Y-sorting, tính toán vật lý đơn giản và FSM (Finite State Machine).

Kiểm soát Memory Leak: Khi một Scene bị Stop/Sleep, hoặc một Component Vue bị unmount, BẮT BUỘC phải có logic dọn dẹp (clear event listeners, destroy tweens, stop timers).

DRY (Don't Repeat Yourself): Rà soát các đoạn logic lặp lại trong source code của tôi và chủ động tách chúng ra thành các file Utils hoặc Vue Composables dùng chung.

🏗️ ĐỊNH HƯỚNG KIẾN TRÚC LÕI (CORE ARCHITECTURE)
Dự án này phải tuân thủ nghiêm ngặt luồng dữ liệu 1 chiều:
👉 Pinia (Nguồn dữ liệu thật - Source of Truth) -> Vue 3 (Hiển thị UI/HUD) -> Phaser 3 (Render thế giới vật lý 2.5D).

Tách biệt UI & Game: Toàn bộ Menu, Nút bấm, Inventory, Shop UI, Hội thoại... phải nằm ở Vue 3. Phaser 3 chỉ vẽ nhân vật, map và xử lý va chạm. Giao tiếp qua EventBus.

Tránh Vue Reactivity quét WebGL: Bất cứ khi nào Vue gọi instance của Phaser, BẮT BUỘC phải bọc qua toRaw() để không làm sụt FPS.

🗺️ YÊU CẦU REFACTOR CHI TIẾT (THỰC HIỆN TỪNG BƯỚC)
Hãy bắt đầu bằng việc xác nhận bạn đã hiểu các quy tắc và kiến trúc này. Sau đó, viết vào 1 file markdown `UPDATE_GAME_SCENCE.md` hướng dẫn tôi và cung cấp code refactor cho Bước 1 và Bước 2 trước. Đợi tôi test xong mới làm tiếp các bước sau.

BƯỚC 1: Quản lý Scene & Mô phỏng ngầm (Off-screen Simulation)
Cách Stardew Valley hoạt động: Mỗi khu vực (Shop, Town, Gym) phải là một Phaser.Scene độc lập.

Thiết lập SceneManager: Khi nhân vật đi qua cửa Shop để ra Town, Scene ShopScene sẽ tạm dừng (sleep hoặc stop), màn hình dùng camera fadeOut -> fadeIn, và TownScene được khởi chạy. Tách biệt hoàn toàn để không render môi trường không nhìn thấy.

Mô phỏng ngầm với Pinia: Dữ liệu và lịch trình của NPC/Staff (đang đi đâu, làm gì) PHẢI được chạy bằng toán học thời gian thực bên trong Pinia (hoặc một lớp Logic Controller độc lập không gắn với Scene). Khi Scene (ví dụ TownScene) được load lên, nó sẽ "hỏi" Pinia xem NPC nào đang ở Town và vẽ tọa độ/hình ảnh của họ ra đúng vị trí đó.

BƯỚC 2: Kiến trúc Không gian 2.5D (Top-Down Oblique)
Cách Stardew Valley vẽ tường và chiều sâu:

Cấu trúc lại cách đọc Tilemap. Vách tường bắt buộc phải chia làm 2 Layer:

Layer Wall Front (Mặt trước tường): Nằm cùng lớp với người chơi, tham gia Y-Sorting. Nhân vật đi ra sau sẽ bị mặt tường che khuất phần thân.

Layer Wall Top (Đỉnh tường/Độ dày của tường): LUÔN nằm trên cùng (AlwaysFront). Nó sẽ che khuất phần đầu của nhân vật khi nhân vật chui ra sau tường. (Đặc biệt: Vách tường phía Nam / dưới cùng của phòng sẽ chỉ vẽ 1 dải Wall Top làm ranh giới chặn, không vẽ mặt trước).

Y-Sorting Tối ưu: Thuật toán phân loại trục Y chỉ áp dụng cho các Dynamic Sprites (Player, NPC, Kệ hàng). Set độ sâu bằng tọa độ Y: child.setDepth(child.y).

Bù trừ Hitbox (Hitbox offset): Mọi sprite động (nhân vật) phải có Origin ở dưới đáy (0.5, 1.0). Hitbox vật lý phải thu nhỏ lại chỉ bao quanh phần bàn chân để cho phép phần thân trên (đầu, vai) có thể lấp ló đè lên các vật thể khác.

Thêm logic vẽ Bóng đổ (Drop Shadow) hình oval mờ dưới chân mọi nhân vật/NPC để neo họ vào mặt đất.

BƯỚC 3: Máy trạng thái (FSM) cho Nhân vật & AI
Tách toàn bộ logic kiểm tra di chuyển (W, A, S, D) và hoạt ảnh (Animations) ra khỏi hàm update() đang bị cồng kềnh.

Triển khai Finite State Machine (FSM) cho Player và NPC. Cần có các state cơ bản: IdleState, WalkState. Điều này giúp khắc phục lỗi kẹt animation và dễ dàng mở rộng thêm các hành động mới (như bưng bê hàng, giao tiếp) sau này.