import { TEX } from '../../features/environment/assetKeys'

/**
 * AppConfig - Bảng điều khiển trung tâm của trò chơi.
 * Mọi thay đổi về cấu hình, hình ảnh, âm thanh, và ngôn ngữ đều nên thực hiện tại đây.
 */
export const AppConfig = {
  GAME: {
    CAMERA: {
      ZOOM: 1.8,             // Độ phóng lớn của camera (1.0 = nhìn xa, 2.5 = nhìn cực gần)
      CLAMP_BOUNDS: true,    // Chặn camera không cho đi ra ngoài biên giới thế giới
    },
    SETTINGS: {
      AUTO_SAVE: true,       // Bật/Tắt tự động lưu game khi có thay đổi dữ liệu (localStorage)
      TARGET_FPS: 60,        // Tốc độ khung hình mục tiêu
    },
    TIME: {
      MINUTES_PER_SEC: 1,    // Tốc độ thời gian trôi (1 phút game = 1 giây thực)
    }
  },

  ISOMETRIC: {
    ENABLED: true,          // Bật chế độ isometric (true = bật, false = oblique 2.5D hiện tại)
    TILE_WIDTH: 64,          // Chiều rộng tile isometric (px) — tỷ lệ 2:1 với tileHeight
    TILE_HEIGHT: 32,         // Chiều cao tile isometric (px)
    GRID_CELL: 16,           // Kích thước ô lưới pathfinding (px)
    MOVE_Y_SCALE: 0.5,       // Hệ số tốc độ trục Y để khớp tỷ lệ 2:1 (tileHeight/tileWidth)
    DEPTH_BASE: 100,         // Base depth layer cho dynamic entities
    CAMERA_OFFSET_X: 200,    // Offset camera X từ gốc tọa độ isometric (để nhìn rõ map)
    CAMERA_OFFSET_Y: 100,    // Offset camera Y từ gốc tọa độ isometric

    // Isometric map configuration
    MAP: {
      GRID_WIDTH: 20,        // Số tiles ngang
      GRID_HEIGHT: 20,       // Số tiles dọc
      ORIGIN_X: 320,         // Tọa độ X của gốc isometric trên screen
      ORIGIN_Y: 64,          // Tọa độ Y của gốc isometric trên screen
    }
  },

  /**
   * ── MATTER.JS PHYSICS CONFIG ──────────────────────────────────────────────
   * Cấu hình vật lý Matter.js cho chế độ Isometric.
   * Chỉ được sử dụng khi ISOMETRIC.ENABLED = true.
   *
   * NGUYÊN TẮC:
   * - Gravity = 0 (top-down / isometric, không có rơi tự do)
   * - Debug = true trong development (tắt trong production)
   * - Friction settings đảm bảo cảm giác di chuyển mượt mà
   */
  MATTER: {
    DEBUG: true,              // Hiển thị wireframe hitbox — TẮT khi release!

    // Player physics tuning
    PLAYER: {
      FOOT_RADIUS: 10,       // Bán kính circle body ở chân (px)
      FRICTION: 0.1,         // Ma sát tiếp xúc (thấp = trượt ít khi chạm tường)
      FRICTION_AIR: 0.15,    // Ma sát không khí (cao = dừng nhanh khi thả phím, chống trượt băng)
      FRICTION_STATIC: 0.5,  // Ma sát tĩnh (ngăn trượt khi đứng trên dốc)
      RESTITUTION: 0,        // Độ nảy (0 = không nảy khi chạm tường)
    },

    // Furniture physics
    FURNITURE: {
      DIAMOND_SCALE: 0.8,    // Tăng nhẹ độ rộng hitbox
      FOOT_RATIO: 0.15,      // Giảm chiều cao foot area để hitbox dẹt hơn, sát đất hơn
    },

    // Wall physics
    WALL: {
      BODY_SIZE: 32,          // Tăng mạnh để các wall bodies chạm nhau, tạo thành bức tường đặc
    },
  },

  ASSETS: {
    // Danh sách các sheet NPC để chọn ngẫu nhiên
    NPC_POOLS: [
      { key: 'npc_sheet', path: 'npc_sheet.png' },
      { key: 'npc_sheet_1', path: 'npc_sheet_1.png' },
      // Ví dụ: Bạn hãy thêm npc_sheet_2.png vào assets/images rồi khai báo ở đây
      // { key: 'npc_sheet_2', path: 'npc_sheet_2.png' }, 
    ],

    // Danh sách các sheet Nhân viên
    STAFF_POOLS: [
      { key: 'staff_sheet', path: 'staff_sheet.png' },
      // { key: 'staff_sheet_1', path: 'staff_sheet_1.png' },
    ],

    // Phân loại thùng hàng
    BOXES: {
      ITEM: TEX.BOX_ITEM,        // Thùng hàng bình thường
      FURNITURE: TEX.BOX_ITEM,   // TẠM THỜI dùng chung box_item (Thay bằng 'box_furniture' khi có file)
    }
  },

  UI: {
    TITLES: {
      EDIT_MODE: 'CHẾ ĐỘ DI CHUYỂN',
      BUILD_MODE: 'LỰA CHỌN NỘI THẤT',
      SHELF_MANAGEMENT: 'QUẢN LÝ KỆ HÀNG',
      GYM_TOWN: '⛩️ KHU GYM',
    },
    MESSAGES: {
      LEVEL_REQUIRED: 'Cấp độ yêu cầu: {level}',
      INSUFFICIENT_FUNDS: 'Bạn không đủ tiền để mua món đồ này!',
      PLACE_HINT: 'ROTATE: R',
      GO_TO_GYM: 'Bấm [E] để tới Gym Town',
      RETURN_TO_SHOP: 'Bấm [E] về Shop',
    }
  }
}
