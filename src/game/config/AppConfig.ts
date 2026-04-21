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
