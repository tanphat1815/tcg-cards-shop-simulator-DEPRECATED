import MainScene from '../../../game/MainScene'
import { DEPTH } from '../config'
import { TEX } from '../assetKeys'
import { BASE_SHOP_WIDTH, BASE_SHOP_HEIGHT, getExpansionDimensions } from '../../stats/config'
import { useGameStore } from '../../shop-ui/store/gameStore'

/**
 * EnvironmentManager - Quản lý toàn bộ môi trường của Shop trong Phaser.
 * 
 * Chức năng chính:
 * - Khởi tạo và quản lý các Layer đồ họa (Sàn, Tường, Vỉa hè).
 * - Xây dựng và cập nhật hệ thống vật lý tường (Physics Walls) để chặn Player/NPC.
 * - Xử lý logic mở rộng diện tích Shop (Expansion) theo cấp độ.
 * - Vẽ Preview vùng dự kiến mở rộng (Blueprint/Glow) dựa trên cài đặt người dùng.
 * 
 * Luồng hoạt động:
 * 1. Khởi tạo Managers và Physics Groups trong Constructor.
 * 2. initializeEnvironment() được gọi để vẽ Shop lần đầu.
 * 3. refreshEnvironment() được gọi mỗi khi Store thay đổi (mở rộng shop, bật tắt preview).
 * 4. updatePhysicalWalls() đồng bộ hóa vùng va chạm vật lý với kích thước hình ảnh.
 */
export class EnvironmentManager {
  private scene: MainScene
  private floorGraphics!: Phaser.GameObjects.Graphics
  private wallGraphics!: Phaser.GameObjects.Graphics
  private outsideGraphics!: Phaser.GameObjects.Graphics
  
  // Các khối va chạm vật lý (ẩn)
  private wallTop!: Phaser.GameObjects.Rectangle
  private wallLeft!: Phaser.GameObjects.Rectangle
  private wallRight!: Phaser.GameObjects.Rectangle
  private wallBottomLeft!: Phaser.GameObjects.Rectangle
  private wallBottomRight!: Phaser.GameObjects.Rectangle
  
  private doorLocation = { x: 0, y: 0 }
  private shopBounds = { x: 0, y: 0, w: 0, h: 0 }

  // Exterior Zones — Các Manager khác truy cập qua getter
  public deliveryZone!: { x: number; y: number; width: number; height: number }
  public warpGateZone!: { x: number; y: number }
  public idleStaffZone!: { x: number; y: number; width: number }
  
  private sidewalkGraphics!: Phaser.GameObjects.Graphics
  private floorTileSprite!: Phaser.GameObjects.TileSprite
  private wallTopSprite!: Phaser.GameObjects.TileSprite
  private wallSideSprites: Phaser.GameObjects.TileSprite[] = []
  private sidewalkTileSprite!: Phaser.GameObjects.TileSprite
  
  /** Group chứa tất cả tường để kiểm tra va chạm tập trung */
  public wallsGroup!: Phaser.Physics.Arcade.StaticGroup

  /** Tọa độ gốc mốc (Offset) để đặt shop ở giữa thế giới game rộng lớn */
  public static readonly START_X = 1000
  public static readonly START_Y = 1000

  constructor(scene: MainScene) {
    this.scene = scene
    this.wallsGroup = this.scene.physics.add.staticGroup()
    this.initializeGraphics()
    this.createWalls()
  }

  /**
   * Khởi tạo các đối tượng Graphics cho các layer khác nhau. 
   * Thứ tự DEPTH rất quan trọng để tránh chồng lấn đồ họa.
   */
  private initializeGraphics() {
    this.outsideGraphics = this.scene.add.graphics().setDepth(DEPTH.OUTSIDE)
    this.sidewalkGraphics = this.scene.add.graphics().setDepth(DEPTH.FLOOR + 0.5)
    this.floorGraphics = this.scene.add.graphics().setDepth(DEPTH.FLOOR)
    this.wallGraphics = this.scene.add.graphics().setDepth(DEPTH.WALL_GRAPHICS)
  }

  /**
   * Khởi tạo các Physics Rectangles (vùng vật lý).
   * Các khối này mặc định được đặt SetVisible(false) vì chúng ta sử dụng Graphics để vẽ hình ảnh đẹp hơn.
   */
  private createWalls() {
    // 1. Lấy kích thước shop hiện tại từ config
    const gameStore = useGameStore()
    const { extraW, extraH } = getExpansionDimensions(gameStore.expansionLevel)
    const width = BASE_SHOP_WIDTH + extraW
    const height = BASE_SHOP_HEIGHT + extraH

    // 2. Xác định phạm vi và vị trí cửa (trọng tâm của tường dưới)
    this.shopBounds = { x: EnvironmentManager.START_X, y: EnvironmentManager.START_Y, w: width, h: height }
    this.doorLocation = { x: EnvironmentManager.START_X + width / 2, y: EnvironmentManager.START_Y + height }

    // 3. Tạo các khối vật lý bao quanh shop
    const { x, y, w, h } = this.shopBounds
    const thickness = 50

    // NORTH WALL: The physical collider must be tall enough to stop the player
    // BEFORE they walk under the LAYER4_WALL_TOP tile sprite (height = 48px).
    // We use a thickness of 96px (= 48px tile + 48px interior buffer) so the
    // player is pushed back while still appearing to stand close to the wall.
    // The wall rectangle is positioned so its BOTTOM edge aligns with startY,
    // meaning it extends 96px upward into the "void" above the shop.
    const NORTH_WALL_THICKNESS = 96
    this.wallTop = this.scene.add.rectangle(
      x + w / 2,
      y - NORTH_WALL_THICKNESS / 2,
      w,
      NORTH_WALL_THICKNESS,
      0x8B4513
    ).setDepth(DEPTH.WALL)

    this.wallLeft = this.scene.add.rectangle(x - thickness/2, y + h / 2, thickness, h, 0x8B4513).setDepth(DEPTH.WALL)
    this.wallRight = this.scene.add.rectangle(x + w + thickness/2, y + h / 2, thickness, h, 0x8B4513).setDepth(DEPTH.WALL)
    
    // Tường dưới chia làm 2 bên để hở khe ở giữa làm cửa
    const doorWidth = 80
    const sideWallW = (w - doorWidth) / 2
    this.wallBottomLeft = this.scene.add.rectangle(x + sideWallW / 2, y + h + thickness / 2, sideWallW, thickness, 0x8B4513).setDepth(DEPTH.WALL)
    this.wallBottomRight = this.scene.add.rectangle(x + w - sideWallW / 2, y + h + thickness / 2, sideWallW, thickness, 0x8B4513).setDepth(DEPTH.WALL)

    // 4. Kích hoạt vật lý Static cho sàn/tường
    const walls = [this.wallTop, this.wallLeft, this.wallRight, this.wallBottomLeft, this.wallBottomRight]
    walls.forEach(w => {
      this.scene.physics.add.existing(w, true)
      this.wallsGroup.add(w)
      w.setVisible(false) // Ẩn vùng vật lý nâu mặc định của Phaser
    })

    // 5. Khởi tạo tọa độ các zone ngoại cảnh ngay lập tức
    this.computeExteriorZones()

    // Tạo lỗ cửa (Visual)
    this.scene.add.rectangle(this.doorLocation.x, this.doorLocation.y, 80, 60, 0x000000).setDepth(DEPTH.WALL + 1).setVisible(false)
  }

  /**
   * Vẽ màu nền và Grid cho sàn nhà.
   */
  drawFloor() {
    const gameStore = useGameStore()
    const { extraW, extraH } = getExpansionDimensions(gameStore.expansionLevel)
    const width = BASE_SHOP_WIDTH + extraW
    const height = BASE_SHOP_HEIGHT + extraH
    const { x, y } = this.shopBounds

    this.floorGraphics.clear()
    this.floorGraphics.fillStyle(0xD2B48C) // Màu gỗ/cát nhạt
    this.floorGraphics.fillRect(x, y, width, height)

    // Vẽ các đường kẻ Line tạo cảm giác ô gạch
    this.floorGraphics.lineStyle(2, 0x8B4513)
    for (let lx = 0; lx <= width; lx += 100) {
      this.floorGraphics.lineBetween(x + lx, y, x + lx, y + height)
    }
    for (let ly = 0; ly <= height; ly += 100) {
      this.floorGraphics.lineBetween(x, y + ly, x + width, y + ly)
    }
  }

  /**
   * Vẽ hình ảnh biểu diễn tường dựa trên Graphics.
   */
  drawWalls() {
    const gameStore = useGameStore()
    const { extraW, extraH } = getExpansionDimensions(gameStore.expansionLevel)
    const width = BASE_SHOP_WIDTH + extraW
    const height = BASE_SHOP_HEIGHT + extraH
    const { x, y } = this.shopBounds

    this.wallGraphics.clear()
    this.wallGraphics.fillStyle(0x8B4513) // Màu gỗ tối
    this.wallGraphics.fillRect(x - 5, y - 50, width + 10, 50) // Tường trên (vẽ lùi lên trên 50px)
    this.wallGraphics.fillRect(x - 50, y - 50, 50, height + 50) // Tường trái
    this.wallGraphics.fillRect(x + width, y - 50, 50, height + 50) // Tường phải
    
    // Tường phía dưới (cổng ra vào)
    this.wallGraphics.fillRect(x, y + height - 50, 200, 50) // Tường dưới trái
    this.wallGraphics.fillRect(x + width - 200, y + height - 50, 200, 50) // Tường dưới phải

    // Vẽ vùng đen biểu thị lối ra vào
    this.wallGraphics.fillStyle(0x000000)
    this.wallGraphics.fillRect(this.doorLocation.x - 40, this.doorLocation.y - 30, 80, 60)
  }

  /**
   * Vẽ không gian bên ngoài shop (Vỉa hè/Cỏ).
   */
  drawOutside() {
    const gameStore = useGameStore()
    const { extraW, extraH } = getExpansionDimensions(gameStore.expansionLevel)
    const width = BASE_SHOP_WIDTH + extraW
    const height = BASE_SHOP_HEIGHT + extraH
    const { x, y } = this.shopBounds

    this.outsideGraphics.clear()
    this.outsideGraphics.fillStyle(0x90EE90) // Màu cỏ xanh nhạt
    this.outsideGraphics.fillRect(x - 1000, y - 1000, width + 2000, height + 2000)

    // Viền đậm ngăn cách shop với môi trường ngoài
    this.outsideGraphics.lineStyle(4, 0x228B22)
    this.outsideGraphics.strokeRect(x, y, width, height)
  }

  /**
   * Cập nhật vị trí và kích thước khi người chơi "Mở rộng Shop" (Expansion).
   */
  updateExpansion() {
    const gameStore = useGameStore()
    const { extraW, extraH } = getExpansionDimensions(gameStore.expansionLevel)
    const width = BASE_SHOP_WIDTH + extraW
    const height = BASE_SHOP_HEIGHT + extraH

    const startX = EnvironmentManager.START_X
    const startY = EnvironmentManager.START_Y

    // 1. Tính toán lại độ dài mảnh tường dưới khi độ rộng shop thay đổi
    const sideWallW = (width - 80) / 2
    const thickness = 50

    // 2. Chốt lại vị trí mới cho các khối va chạm
    this.wallTop.setPosition(startX + width / 2, startY - thickness/2)
    this.wallTop.setSize(width, thickness)

    this.wallLeft.setPosition(startX - thickness/2, startY + height / 2)
    this.wallLeft.setSize(thickness, height)

    this.wallRight.setPosition(startX + width + thickness/2, startY + height / 2)
    this.wallRight.setSize(thickness, height)

    this.wallBottomLeft.setPosition(startX + sideWallW / 2, startY + height + thickness / 2)
    this.wallBottomLeft.setSize(sideWallW, thickness)

    this.wallBottomRight.setPosition(startX + width - sideWallW / 2, startY + height + thickness / 2)
    this.wallBottomRight.setSize(sideWallW, thickness)

    // 3. Cập nhật mốc tọa độ mới
    this.shopBounds = { x: startX, y: startY, w: width, h: height }
    this.doorLocation = { x: startX + width / 2, y: startY + height }

    // Vẽ lại
    this.drawFloor()
    this.drawWalls()
    this.drawOutside()
  }

  /**
   * Khởi tạo môi trường shop ban đầu
   */
  initializeEnvironment() {
    this.drawOutside()
    this.drawFloor()
    this.drawWalls()
    this.updatePhysicalWalls()
  }

  /**
   * Refresh Environment là Orchestrator cho việc vẽ lại shop.
   * Thường được gọi bởi Store Subscription khi Expansion hoặc Settings thay đổi.
   */
  refreshEnvironment() {
    // SAFETY CHECK: Tránh crash nếu scene chưa sẵn sàng hoặc đã bị hủy (Ghost Subscriptions)
    if (!this.scene || !this.scene.cameras || !this.scene.cameras.main) {
      return
    }

    try {
      const store = useGameStore()
      const { extraW, extraH } = getExpansionDimensions(store.expansionLevel)

      const shopW = BASE_SHOP_WIDTH + extraW
      const shopH = BASE_SHOP_HEIGHT + extraH
      const startX = EnvironmentManager.START_X
      const startY = EnvironmentManager.START_Y

      this.shopBounds = { x: startX, y: startY, w: shopW, h: shopH }
      this.doorLocation = { x: startX + shopW / 2, y: startY + shopH }

      // DO NOT clamp camera to shop interior. The player must be free to walk
      // outdoors to the Delivery Zone, Sidewalk, and Gym Town.
      // Camera and physics bounds are set once in MainScene.create() to the
      // full world size (5500 x 3000) and are never overwritten here.

      // 0. Street/Background
      this.outsideGraphics.clear()
      this.outsideGraphics.fillStyle(0x1a1a1a, 1) // Dark street
      this.outsideGraphics.fillRect(0, 0, 5500, 3000)

      // 1. FLOOR — Layer 1: Always below everything.
      if (!this.floorTileSprite) {
        this.floorTileSprite = this.scene.add.tileSprite(startX, startY, shopW, shopH, TEX.FLOOR_TILE)
          .setOrigin(0, 0)
          .setDepth(DEPTH.LAYER1_FLOOR)
      } else {
        this.floorTileSprite.setPosition(startX, startY)
        this.floorTileSprite.setSize(shopW, shopH)
        this.floorTileSprite.setDepth(DEPTH.LAYER1_FLOOR)
      }

      // 2. WALL TOP (North) — Layer 2: Rendered behind characters.
      // We change this from LAYER4 (9000) to LAYER2 (20) so that characters
      // standing "against" the wall are not obscured by the ceiling overhang.
      if (!this.wallTopSprite) {
        this.wallTopSprite = this.scene.add.tileSprite(startX, startY, shopW, 48, TEX.WALL_TOP)
          .setOrigin(0, 1)
          .setDepth(DEPTH.LAYER2_WALL_BASE + 5)
      } else {
        this.wallTopSprite.setPosition(startX, startY)
        this.wallTopSprite.setSize(shopW, 48)
        this.wallTopSprite.setDepth(DEPTH.LAYER2_WALL_BASE + 5)
      }

      // 3. WALL SIDES — Layer 2 (base) + Layer 4 (top cap).
      //
      // ARCHITECTURAL APPROACH FOR 2.5D VERTICAL WALLS:
      // A tileSprite stretched horizontally across shopH pixels makes the wall
      // texture scroll SIDEWAYS (like a carpet), not vertically. This looks flat.
      //
      // The correct approach: treat each side wall as a COLUMN of individual
      // tile sprites, each one tile-texture tall, stacked from top to bottom.
      // This preserves the vertical texture orientation (bricks read downward).
      //
      // TILE_H = the pixel height of the TEX.WALL_SIDE texture frame.
      // We use 32px as the canonical tile size (matches FLOOR_TILE).
      //
      // Each column tile is drawn at:
      //   depth = LAYER3_OBJECTS + tileY   (same Y-sort formula as entities)
      // so that entities can correctly walk in FRONT of the lower wall tiles
      // and BEHIND the upper wall tiles.

      this.wallSideSprites.forEach(s => s.destroy())
      this.wallSideSprites = []

      const SIDE_T   = 32  // wall pillar width (pixels)
      const TILE_H   = 32  // height of one wall tile row (pixels)
      const doorWidth = 80
      const sideWallW = (shopW - doorWidth) / 2

      // Helper: stack wall tiles vertically to build one wall column/row.
      // For left/right pillars: iterate Y from startY to startY+shopH.
      // For bottom strips:      iterate X from startX to startX+sideWallW.
      const addVerticalColumn = (colX: number, colY: number, totalH: number, colW: number) => {
        let y = colY
        while (y < colY + totalH) {
          const tileH = Math.min(TILE_H, colY + totalH - y)
          const tile = this.scene.add.tileSprite(colX, y, colW, tileH, TEX.WALL_SIDE)
            .setOrigin(0, 0)
            // Y-sort depth: lower tiles render in front of higher tiles, matching
            // the perspective of a 2.5D camera. Entities walking in front of the
            // bottom of the wall will sort above it; entities near the top will
            // sort below the upper tiles.
            // Using a -5 offset ensures characters win tie-breakers at the same Y.
            .setDepth(DEPTH.LAYER3_OBJECTS + y - 5)
          this.wallSideSprites.push(tile)
          y += TILE_H
        }
      }

      const addHorizontalStrip = (stripX: number, stripY: number, totalW: number, stripH: number) => {
        // Bottom wall strips are drawn at a fixed depth just below Layer4 so
        // they always render above floor but behind entities that stand in front.
        const tile = this.scene.add.tileSprite(stripX, stripY, totalW, stripH, TEX.WALL_SIDE)
          .setOrigin(0, 0)
          .setDepth(DEPTH.LAYER3_OBJECTS + stripY - 5)
        this.wallSideSprites.push(tile)
      }

      // Left pillar
      addVerticalColumn(startX - SIDE_T, startY, shopH, SIDE_T)
      // Right pillar
      addVerticalColumn(startX + shopW, startY, shopH, SIDE_T)
      // Bottom-left strip (left of door)
      addHorizontalStrip(startX, startY + shopH, sideWallW, SIDE_T)
      // Bottom-right strip (right of door)
      addHorizontalStrip(startX + shopW - sideWallW, startY + shopH, sideWallW, SIDE_T)

      // XỬ LÝ PREVIEW MỞ RỘNG (BLUEPRINT/GLOW) — Layer 4 so it's visible above entities
      if (this.scene.previewGraphics) {
        this.scene.previewGraphics.setDepth(DEPTH.LAYER4_WALL_TOP - 1)
        this.scene.previewGraphics.clear()
        if (store.settings.showExpansionPreview) {
          const nextDim = getExpansionDimensions(store.expansionLevel + 1)
          const nextW = BASE_SHOP_WIDTH + nextDim.extraW
          const nextH = BASE_SHOP_HEIGHT + nextDim.extraH

          if (store.settings.expansionPreviewStyle === 'BLUEPRINT') {
            this.drawDashedRect(startX, startY, nextW, nextH, 0x00ffff)
          } else {
            for (let i = 1; i <= 3; i++) {
               this.scene.previewGraphics.lineStyle(2 * i, 0xffffff, 0.1)
               this.scene.previewGraphics.strokeRect(startX - i, startY - i, nextW + i*2, nextH + i*2)
            }
            this.scene.previewGraphics.lineStyle(2, 0xffffff, 0.8)
            this.scene.previewGraphics.strokeRect(startX, startY, nextW, nextH)
          }
        }
      }

      // Cuối cùng: Đồng bộ hóa vật lý
      this.computeExteriorZones()
      this.drawSidewalk()
      this.updatePhysicalWalls()
    } catch (err) {
      console.error("CRITICAL: EnvironmentManager.refreshEnvironment failed!", err)
    }
  }

  /**
   * Đồng bộ hóa tọa độ của các Rectangle Vật lý (Physics Body) 
   * với vị trí hình ảnh hiện tại của Shop. 
   * Việc này đảm bảo khi Shop nở rộng, vùng va chạm cũng nở rộng theo.
   */
  updatePhysicalWalls() {
    const { x, y, w, h } = this.shopBounds
    const thickness = 40
    const doorWidth = 80
    const sideWallWidth = (w - doorWidth) / 2

    const updateBody = (rect: Phaser.GameObjects.Rectangle) => {
      if (rect && rect.body) {
        (rect.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject()
      } else {
        this.scene.physics.add.existing(rect, true)
      }
    }

    // Gán lại vị trí và cập nhật Engine Vật lý
    // North wall uses the taller thickness so the player cannot walk under
    // the LAYER4_WALL_TOP overhang tile.
    const NORTH_WALL_THICKNESS = 96  // Must match the value in createWalls()
    this.wallTop.setPosition(x + w / 2, y - NORTH_WALL_THICKNESS / 2)
    this.wallTop.setSize(w, NORTH_WALL_THICKNESS)
    updateBody(this.wallTop)

    // Left wall
    this.wallLeft.setPosition(x - thickness / 2, y + h / 2)
    this.wallLeft.setSize(thickness, h)
    updateBody(this.wallLeft)

    // Right wall
    this.wallRight.setPosition(x + w + thickness / 2, y + h / 2)
    this.wallRight.setSize(thickness, h)
    updateBody(this.wallRight)

    // Bottom Left
    this.wallBottomLeft.setPosition(x + sideWallWidth / 2, y + h + thickness / 2)
    this.wallBottomLeft.setSize(sideWallWidth, thickness)
    updateBody(this.wallBottomLeft)

    // Bottom Right
    this.wallBottomRight.setPosition(x + w - sideWallWidth / 2, y + h + thickness / 2)
    this.wallBottomRight.setSize(sideWallWidth, thickness)
    updateBody(this.wallBottomRight)
  }

  private computeExteriorZones() {
    const door = this.doorLocation

    this.deliveryZone = {
      x: door.x - 350,
      y: door.y + 100,
      width: 200,
      height: 50,
    }

    this.warpGateZone = {
      x: door.x + 350,
      y: door.y + 100,
    }

    this.idleStaffZone = {
      x: door.x,
      y: door.y + 180,
      width: 120, // Chiều rộng khu vực để tính offset xếp hàng nhân viên
    }
  }

  private drawSidewalk() {
    const door = this.doorLocation
    const shopW = this.shopBounds.w

    const sidewalkY = door.y + 40
    const sidewalkH = 90
    const sidewalkX = this.shopBounds.x - 100
    const sidewalkW = shopW + 200

    if (!this.sidewalkTileSprite) {
      this.sidewalkTileSprite = this.scene.add.tileSprite(
        sidewalkX, sidewalkY, sidewalkW, sidewalkH, TEX.SIDEWALK_TILE
      ).setOrigin(0, 0).setDepth(DEPTH.FLOOR + 0.1)
    } else {
      this.sidewalkTileSprite.setPosition(sidewalkX, sidewalkY)
      this.sidewalkTileSprite.setSize(sidewalkW, sidewalkH)
    }

    this.sidewalkGraphics.clear()

    // Viền kẻ phân làn (tuỳ chọn, tăng visual)
    this.sidewalkGraphics.lineStyle(2, 0xffffff, 0.15)
    const laneY = sidewalkY + sidewalkH / 2
    this.sidewalkGraphics.lineBetween(sidewalkX, laneY, sidewalkX + sidewalkW, laneY)

    // 2. Vẽ Khu vực nghỉ ngơi của Nhân viên (Idle Zone)
    const iz = this.idleStaffZone
    this.sidewalkGraphics.fillStyle(0x27ae60, 0.3) // Xanh lá mờ
    this.sidewalkGraphics.lineStyle(2, 0x2ecc71, 0.5)
    
    const izRect = new Phaser.Geom.Rectangle(iz.x - iz.width/2, iz.y - 20, iz.width, 40)
    this.sidewalkGraphics.fillRectShape(izRect)
    this.sidewalkGraphics.strokeRectShape(izRect)

    this.scene.add.text(iz.x, iz.y + 25, "STAFF REST AREA", {
      fontSize: '9px',
      color: '#2ecc71',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(DEPTH.FLOOR + 1)
  }

  /**
   * Trả về thông số phạm vi Shop hiện tại (Dùng cho AI NPC định vị)
   */
  getShopBounds() {
    return this.shopBounds
  }

  /**
   * Vẽ hình chữ nhật nét đứt (Dashed Line) tùy chỉnh.
   * Phaser không hỗ trợ sẵn nét đứt, nên chúng ta phải vẽ thủ công từng đoạn.
   * @param x Tọa độ X góc trên trái
   * @param y Tọa độ Y góc trên trái
   * @param w Chiều rộng
   * @param h Chiều cao
   * @param color Màu sắc hex
   */
  private drawDashedRect(x: number, y: number, w: number, h: number, color: number) {
    const dashLength = 10
    const gap = 5
    const graphics = this.scene.previewGraphics
    
    graphics?.lineStyle(3, color, 1.0)
    
    // Cạnh trên
    let currentX = x
    while (currentX < x + w) {
      const nextX = Math.min(currentX + dashLength, x + w)
      graphics?.lineBetween(currentX, y, nextX, y)
      currentX = nextX + gap
    }
    
    // Cạnh phải
    let currentY = y
    while (currentY < y + h) {
      const nextY = Math.min(currentY + dashLength, y + h)
      graphics?.lineBetween(x + w, currentY, x + w, nextY)
      currentY = nextY + gap
    }
    
    // Cạnh dưới
    currentX = x + w
    while (currentX > x) {
      const nextX = Math.max(currentX - dashLength, x)
      graphics?.lineBetween(currentX, y + h, nextX, y + h)
      currentX = nextX - gap
    }
    
    // Cạnh trái
    currentY = y + h
    while (currentY > y) {
      const nextY = Math.max(currentY - dashLength, y)
      graphics?.lineBetween(x, currentY, x, nextY)
      currentY = nextY - gap
    }
  }

  /**
   * Trả về tọa độ cửa shop (Nơi NPC đi vào/ra)
   */
  getDoorLocation() {
    return this.doorLocation
  }

  /**
   * Dọn dẹp bộ nhớ khi Scene kết thúc. 
   * Tránh rò rỉ bộ nhớ (Memory Leak) trong Phaser.
   */
  destroy() {
    this.floorGraphics.destroy()
    this.wallGraphics.destroy()
    this.outsideGraphics.destroy()
    this.sidewalkGraphics.destroy()
    this.wallTop.destroy()
    this.wallLeft.destroy()
    this.wallRight.destroy()
    this.wallBottomLeft.destroy()
    this.wallBottomRight.destroy()
  }
}