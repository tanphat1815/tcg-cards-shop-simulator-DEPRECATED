# 19 — Exterior Zoning Blueprint
## Quy hoạch Ngoại cảnh Shop (Delivery Zone · Warp Gate · Staff Idle Zone)

> **Dành cho:** Junior AI Coder  
> **Reviewer bắt buộc:** Senior / Architect xem lại trước khi merge  
> **Priority:** Medium — không ảnh hưởng gameplay logic, chỉ ảnh hưởng layout thị giác & tọa độ AI  
> **Phụ thuộc:** Không có breaking change với Pinia stores. Chỉ động vào tầng Phaser.

---

## 1. Bản đồ Ngoại cảnh Mục tiêu

Dưới đây là sơ đồ ASCII thể hiện **tọa độ tương đối** so với `doorPos` — điểm neo cố định của cửa shop. Junior Coder **phải đọc sơ đồ này trước khi viết bất kỳ dòng code nào**.

```
||  ┌────────────── MẶT TIỀN SHOP (Tường phía Nam) ────────────────┐
||  │                         [CỬA]                                │
||  └──────────────────────────┬───────────────────────────────────┘
||                             │  doorPos (x, y)
||==═══════════════════════ CON ĐƯỜNG (Sidewalk) ═════════════════════||
||  ┌─────────────┐       │   ┌┴─────────────┐          ┌───────────┐ ||
||  │  DELIVERY   │       │   │  IDLE STAFF  │          │   WARP    │ ||
||  │    ZONE     │       │   │     ZONE     │          │   GATE    │ ||
||  │  (bên trái) │       │   │  (ở giữa)    │          │ (bên phải)│ ||
||  └─────────────┘       │   └──────────────┘          └───────────┘ ||
||       doorPos.x - 200        doorPos.x             doorPos.x + 200
||       doorPos.y + 140        doorPos.y + 180       doorPos.y + 140
```

**Quy tắc offset mặc định (dùng cho toàn bộ blueprint này):**

| Zone | X offset từ `doorPos.x` | Y offset từ `doorPos.y` |
|---|---|---|
| `deliveryZone` | `-220` | `+100` |
| `idleStaffZone` | `0` | `+180` |
| `warpGateZone` | `+220` | `+100` |
| Sidewalk (center) | `0` | `+80` |

---

## 2. Sơ đồ File cần sửa đổi

```
src/
├── features/
│   ├── environment/
│   │   └── managers/
│   │       ├── EnvironmentManager.ts   ← BƯỚC 1 (Định nghĩa Zone + Vẽ đường)
│   │       └── DeliveryManager.ts      ← BƯỚC 2 (Tọa độ spawn thùng hàng)
│   ├── staff/
│   │   └── managers/
│   │       └── StaffManager.ts         ← BƯỚC 3 (Tọa độ Idle nhân viên)
│   └── game/
│       └── MainScene.ts                ← BƯỚC 4 (Di chuyển Warp Gate)
```

> ⚠️ **Không được sửa các Pinia store** (`deliveryStore`, `staffStore`, `gymStore`). Blueprint này chỉ động vào tầng rendering Phaser.

---

## 3. Chi tiết Triển khai

---

### BƯỚC 1 — `EnvironmentManager.ts`

**Mục tiêu:** Khai báo tọa độ các zone như public properties, vẽ Sidewalk, và cung cấp getter để các Manager khác dùng.

---

#### 1.1 Khai báo Public Zone Properties

Thêm vào phần **khai báo fields** của class `EnvironmentManager` (cùng khu với `private doorLocation`, `private shopBounds`):

```typescript
// Exterior Zones — Các Manager khác truy cập qua getter
public deliveryZone:  { x: number; y: number; width: number; height: number }
public warpGateZone:  { x: number; y: number }
public idleStaffZone: { x: number; y: number; width: number }
```

> **Lưu ý:** `deliveryZone` cần `width` và `height` vì DeliveryManager cần tạo Static Group sàn đỡ thùng hàng dựa trên kích thước vùng. `warpGateZone` và `idleStaffZone` chỉ cần tọa độ điểm neo.

---

#### 1.2 Khởi tạo giá trị Zone

Tạo một private method mới `computeExteriorZones()` và gọi nó từ cuối hàm `refreshEnvironment()` (sau khi `this.doorLocation` đã được tính xong):

```typescript
private computeExteriorZones() {
  const door = this.doorLocation

  this.deliveryZone = {
    x: door.x - 220,
    y: door.y + 100,
    width: 200,
    height: 50,
  }

  this.warpGateZone = {
    x: door.x + 220,
    y: door.y + 100,
  }

  this.idleStaffZone = {
    x: door.x,
    y: door.y + 180,
    width: 120, // Chiều rộng khu vực để tính offset xếp hàng nhân viên
  }
}
```

**❌ KHÔNG ĐƯỢC làm:**
```typescript
// SAI — hardcode tọa độ tuyệt đối
this.deliveryZone = { x: 1220, y: 1340, width: 200, height: 50 }
```

---

#### 1.3 Vẽ Sidewalk (Con đường vỉa hè)

Thêm một private method `drawSidewalk()`. Gọi method này từ cuối `refreshEnvironment()`, **sau** `computeExteriorZones()`:

```typescript
private drawSidewalk() {
  // Giả sử bạn tái sử dụng this.outsideGraphics hoặc tạo một Graphics layer mới
  // Khuyến nghị: dùng một graphics layer riêng (e.g. this.sidewalkGraphics)
  // để có thể clear/redraw độc lập khi shop mở rộng

  const door = this.doorLocation
  const shopW = this.shopBounds.w

  // Dải vỉa hè ngang trước toàn bộ mặt tiền shop
  const sidewalkY = door.y + 40
  const sidewalkH = 90
  const sidewalkX = this.shopBounds.x - 100  // Vỉa hè rộng hơn shop một chút
  const sidewalkW = shopW + 200

  // Màu gợi ý: 0x5a6478 (xám nhựa đường) hoặc tuỳ chỉnh
  this.sidewalkGraphics.fillStyle(0x5a6478, 1)
  this.sidewalkGraphics.fillRect(sidewalkX, sidewalkY, sidewalkW, sidewalkH)

  // Viền kẻ phân làn (tuỳ chọn, tăng visual)
  this.sidewalkGraphics.lineStyle(2, 0xffffff, 0.15)
  const laneY = sidewalkY + sidewalkH / 2
  this.sidewalkGraphics.lineBetween(sidewalkX, laneY, sidewalkX + sidewalkW, laneY)
}
```

> **Checklist cho Junior:**
> - [ ] Khai báo `private sidewalkGraphics: Phaser.GameObjects.Graphics` cùng chỗ với `this.floorGraphics`.
> - [ ] Khởi tạo nó trong `initializeGraphics()` với `setDepth(DEPTH.FLOOR + 0.5)` (nằm trên nền cỏ, dưới sàn shop).
> - [ ] `drawSidewalk()` phải gọi `this.sidewalkGraphics.clear()` ở đầu hàm để tránh vẽ chồng khi shop expand.

---

#### 1.4 Gọi đúng thứ tự trong `refreshEnvironment()`

Cuối hàm `refreshEnvironment()`, thứ tự gọi phải là:

```typescript
// ... (các logic vẽ floor, wall hiện tại) ...

this.computeExteriorZones()  // 1. Tính tọa độ zone trước
this.drawSidewalk()          // 2. Vẽ vỉa hè dựa trên zone đã tính
this.updatePhysicalWalls()   // 3. Sync physics (đã có sẵn, giữ nguyên)
```

---

### BƯỚC 2 — `DeliveryManager.ts`

**Mục tiêu:** Dùng `this.environmentManager.deliveryZone` làm điểm neo, thay thế toàn bộ logic tính tọa độ hardcode hoặc tương đối với `doorPos` hiện tại.

---

#### 2.1 Cập nhật tạo Static Group sàn đỡ (Delivery Platform)

Trong `constructor`, tìm đoạn tạo `zoneRect` (sàn nền bãi nhận hàng). Thay thế bằng:

```typescript
// Lấy zone từ EnvironmentManager (đã được tính trong refreshEnvironment)
const dz = this.environmentManager.deliveryZone

const zoneRect = this.scene.add.rectangle(
  dz.x,
  dz.y,
  dz.width,
  50,           // chiều cao sàn (giữ cố định 50px)
  0x333333      // màu nhựa đường
)
zoneRect.setDepth(DEPTH.FURNITURE - 1)
this.deliveryZoneGroup.add(zoneRect)

this.scene.add.text(dz.x, dz.y - 20, 'BÃI NHẬN HÀNG', {
  fontSize: '13px',
  fontStyle: 'bold',
  color: '#aaaaaa',
}).setOrigin(0.5).setDepth(DEPTH.FURNITURE)
```

> **Xóa bỏ hoàn toàn:** Logic cũ tính `doorPos.x`, `doorPos.y + 120` và chuỗi text cũ. Không để lại code comment-out.

---

#### 2.2 Cập nhật hàm `spawnBox()`

Tìm hàm `spawnBox()`. Thay phần tính `spawnX`, `spawnY`:

```typescript
private spawnBox(item: { itemId: string; name: string; type: string; quantity: number }) {
  const dz = this.environmentManager.deliveryZone

  // Spawn ngẫu nhiên trong phạm vi ngang của deliveryZone
  const halfWidth = dz.width / 2
  const spawnX = dz.x + Phaser.Math.Between(-halfWidth * 0.7, halfWidth * 0.7)
  const spawnY = dz.y - 80  // Spawn phía trên zone, rơi xuống

  // ... phần còn lại của hàm giữ nguyên ...
}
```

> **Lưu ý vật lý:** Giữ nguyên `body.setGravityY(500)` và `body.setBounce(0.3)` để thùng hàng vẫn có hiệu ứng rơi tự nhiên vào zone.

---

#### 2.3 Cập nhật `updateHintText()` — Khoảng cách phát hiện

Phần `checkPickup` dùng khoảng cách 100px để phát hiện thùng gần — **không cần sửa** vì logic này dựa trên khoảng cách với sprite thùng hàng, không phải với zone.

---

### BƯỚC 3 — `StaffManager.ts`

**Mục tiêu:** Nhân viên ở state `'NONE'` (rảnh rỗi) phải tự di chuyển tới `idleStaffZone`, xếp thành hàng ngang thay vì đứng đè lên nhau trước cửa.

---

#### 3.1 Sửa `updateWorkerTarget()` — Case `'NONE'`

Tìm block `case 'NONE': default:` trong hàm `updateWorkerTarget()`. Thay thế toàn bộ bằng:

```typescript
case 'NONE':
default: {
  // Lấy tọa độ Idle Zone từ EnvironmentManager
  // EnvironmentManager được truy cập thông qua scene (đã được inject vào StaffManager)
  // Nếu chưa có reference, hãy inject EnvironmentManager vào constructor của StaffManager (xem 3.2)

  const idleZone = this.environmentManager.idleStaffZone
  const zoneWidth = idleZone.width

  // Tính offset ngang để các nhân viên đứng thành hàng, không đè lên nhau
  // index là thứ tự của nhân viên trong danh sách hiredWorkers
  const spacing = 32  // pixel cách nhau giữa các nhân viên
  const totalWorkers = useStaffStore().hiredWorkers.length
  const startOffset = -((totalWorkers - 1) * spacing) / 2
  const workerOffset = startOffset + (index * spacing)

  // Giới hạn offset trong phạm vi zone width
  const clampedOffset = Phaser.Math.Clamp(
    workerOffset,
    -(zoneWidth / 2),
    zoneWidth / 2
  )

  worker.targetX = idleZone.x + clampedOffset
  worker.targetY = idleZone.y
  break
}
```

---

#### 3.2 Inject `EnvironmentManager` vào `StaffManager`

Hiện tại `StaffManager` chỉ nhận `scene` trong constructor. Cần bổ sung:

**Trong constructor của `StaffManager`:**
```typescript
constructor(scene: Phaser.Scene, environmentManager: EnvironmentManager) {
  this.scene = scene
  this.environmentManager = environmentManager  // Thêm dòng này
  // ... phần còn lại giữ nguyên ...
}

// Thêm field khai báo:
private environmentManager: EnvironmentManager
```

**Trong `MainScene.ts`, tìm dòng khởi tạo StaffManager:**
```typescript
// TRƯỚC (cũ):
this.staffManager = new StaffManager(this)

// SAU (mới):
this.staffManager = new StaffManager(this, this.environmentManager)
```

> ⚠️ **Thứ tự quan trọng:** `this.environmentManager` phải được khởi tạo TRƯỚC `this.staffManager`. Kiểm tra lại thứ tự trong `create()` của `MainScene.ts`. Hiện tại trong codebase thứ tự đã đúng — giữ nguyên.

---

#### 3.3 Import type `EnvironmentManager`

Đầu file `StaffManager.ts`, thêm import:

```typescript
import { EnvironmentManager } from '../../environment/managers/EnvironmentManager'
```

---

### BƯỚC 4 — `MainScene.ts`

**Mục tiêu:** Di chuyển object Cổng Gym (`shopToTownGate`, `gatePathway`) sang `warpGateZone`. Cập nhật logic phát hiện proximity cho phím `[E]`.

---

#### 4.1 Cập nhật `refreshGates()`

Tìm hàm `refreshGates()`. Sửa lại toàn bộ logic tính toán vị trí:

```typescript
public refreshGates() {
  if (!this.environmentManager || !this.shopToTownGate) return

  // Lấy tọa độ từ zone đã tính (KHÔNG hardcode)
  const wz = this.environmentManager.warpGateZone
  const dz = this.environmentManager.deliveryZone
  const doorPos = this.environmentManager.getDoorLocation()

  // 1. Di chuyển text cổng Gym sang warpGateZone
  this.shopToTownGate.setPosition(wz.x, wz.y)

  // 2. Vẽ lại pathway — chỉ nối từ cửa đến warpGateZone (không kéo dài sang trái)
  this.gatePathway.clear()
  this.gatePathway.fillStyle(0x34495e, 1)

  const pathW = 60
  // Đường dọc từ doorPos xuống giao với sidewalk
  const pathFromY = doorPos.y
  const pathToY = wz.y + 20

  this.gatePathway.fillRect(doorPos.x - pathW / 2, pathFromY, pathW, pathToY - pathFromY)

  // Đường ngang từ cửa sang phải đến warpGate (trên nền sidewalk)
  const hPathY = doorPos.y + 80  // Giữa sidewalk
  const hPathH = 30
  this.gatePathway.fillRect(doorPos.x, hPathY, wz.x - doorPos.x + 20, hPathH)
}
```

---

#### 4.2 Cập nhật `updateGateHints()` — Proximity Detection

Tìm hàm `updateGateHints()`. Sửa phần tính khoảng cách:

```typescript
private updateGateHints() {
  if (this.isTeleporting) {
    this.gateHintText.setVisible(false)
    return
  }

  // Dùng tọa độ từ zone (không dùng magic numbers)
  const wz = this.environmentManager.warpGateZone
  const GATE_DETECT_RADIUS = 80  // px

  const distToTownGate = Phaser.Math.Distance.Between(
    this.player.x, this.player.y,
    wz.x, wz.y
  )

  // Cổng quay về Shop (vẫn giữ logic cũ với TownManager.TOWN_START_X)
  const distToShopGate = Phaser.Math.Distance.Between(
    this.player.x, this.player.y,
    TownManager.TOWN_START_X + 50, 500
  )

  if (distToTownGate < GATE_DETECT_RADIUS) {
    this.gateHintText.setText('Bấm [E] để tới Gym Town').setVisible(true)
  } else if (distToShopGate < GATE_DETECT_RADIUS) {
    this.gateHintText.setText('Bấm [E] về Shop').setVisible(true)
  } else {
    this.gateHintText.setVisible(false)
  }
}
```

---

#### 4.3 Cập nhật `handlePlayerInteraction()` — Teleport Trigger

Tìm block "Ưu tiên 0: Cổng dịch chuyển" trong `handlePlayerInteraction()`. Sửa phần tính `distToTown`:

```typescript
// TRƯỚC (cũ — dùng doorPos.y + 150):
const distToTown = Phaser.Math.Distance.Between(
  this.player.x, this.player.y,
  doorPos.x, doorPos.y + 150
)

// SAU (mới — dùng warpGateZone):
const wz = this.environmentManager.warpGateZone
const distToTown = Phaser.Math.Distance.Between(
  this.player.x, this.player.y,
  wz.x, wz.y
)
```

> Giữ nguyên `distToShop` và logic `performTeleport()` — không sửa.

---

## 4. Checklist Bắt buộc (Guardrails)

Junior Coder **phải self-check toàn bộ danh sách sau** trước khi commit:

### ✅ Quy tắc Tọa độ
- [ ] **Không có tọa độ tuyệt đối** (số nguyên hardcode như `1220`, `1340`) trong bất kỳ file nào thuộc blueprint này.
- [ ] Mọi tọa độ đều được tính từ `doorPos`, `this.shopBounds`, `EnvironmentManager.START_X / START_Y` hoặc từ các `Zone` object đã khai báo.
- [ ] Sau khi shop **expand** (tăng `expansionLevel`), gọi `refreshGates()` và `drawSidewalk()` — vị trí các zone phải tự cập nhật chính xác.

### ✅ Quy tắc Phụ thuộc
- [ ] `computeExteriorZones()` phải được gọi **sau** khi `this.doorLocation` được set trong `refreshEnvironment()`.
- [ ] `StaffManager` nhận `EnvironmentManager` qua constructor — không gọi `useGameStore()` hay `useStatsStore()` bên trong `StaffManager` chỉ để lấy tọa độ.
- [ ] `DeliveryManager` đọc `this.environmentManager.deliveryZone` **sau khi scene đã qua `create()` và `refreshEnvironment()` được gọi ít nhất một lần**. Không đọc zone trong constructor trước khi `refreshEnvironment()` chạy.

### ✅ Quy tắc Visual
- [ ] `sidewalkGraphics` có `setDepth(DEPTH.FLOOR + 0.5)` — nằm trên cỏ (`DEPTH.FLOOR = 2`), dưới sàn shop.
- [ ] Text nhãn zone (`BÃI NHẬN HÀNG`, `⛩️ KHU GYM`) có `setDepth(DEPTH.FURNITURE)` để không bị che khuất.
- [ ] `drawSidewalk()` phải `clear()` graphics trước khi vẽ lại.

### ✅ Quy tắc Không Phá Vỡ Logic
- [ ] **Không sửa** `deliveryStore.ts`, `staffStore.ts`, `gymStore.ts` — các store không liên quan.
- [ ] **Không sửa** logic `handleShelfInteraction()` trong `DeliveryManager.ts`.
- [ ] **Không sửa** `npcManager`, `furnitureManager` — không nằm trong scope.
- [ ] `WARP_GATE_EXCLUSION_RADIUS` (nếu còn tồn tại trong codebase) có thể **xóa hoàn toàn** — không còn cần thiết.
- [ ] Sau khi sửa, chạy flow kiểm tra: mở cửa shop → mua hàng → nhận hàng tại Delivery Zone → xếp kệ. Không được có regression.

### ✅ Quy tắc Naming Convention
- [ ] Zone properties dùng đúng tên: `deliveryZone`, `warpGateZone`, `idleStaffZone` (camelCase).
- [ ] Không đặt tên mơ hồ như `zone1`, `leftZone`, `myZone`.

---

## 5. Thứ tự Thực thi Khuyến nghị

Để tránh lỗi compile cascade, Junior Coder nên thực hiện theo đúng thứ tự sau:

```
1. EnvironmentManager.ts
   → Khai báo fields (deliveryZone, warpGateZone, idleStaffZone)
   → Thêm sidewalkGraphics vào initializeGraphics()
   → Viết computeExteriorZones()
   → Viết drawSidewalk()
   → Cập nhật refreshEnvironment() để gọi 2 hàm mới

2. MainScene.ts (phần inject StaffManager)
   → Sửa dòng `new StaffManager(this)` → `new StaffManager(this, this.environmentManager)`

3. StaffManager.ts
   → Thêm field + import EnvironmentManager
   → Cập nhật constructor signature
   → Sửa case 'NONE' trong updateWorkerTarget()

4. DeliveryManager.ts
   → Sửa constructor (tạo delivery platform dùng deliveryZone)
   → Sửa spawnBox() (tọa độ spawn dùng deliveryZone)

5. MainScene.ts (phần Warp Gate)
   → Sửa refreshGates()
   → Sửa updateGateHints()
   → Sửa handlePlayerInteraction() — distToTown
```

---

## 6. Ghi chú Kiến trúc

- **Tại sao không dùng Pinia store để lưu Zone coordinates?** Vì đây là thông tin **rendering-layer only** — không cần Vue reactivity, không cần persist, không có component nào subscribe. Lưu trong class property của `EnvironmentManager` là đủ và hiệu quả hơn.

- **Tại sao `idleStaffZone` có `width` nhưng `warpGateZone` thì không?** `warpGateZone` là một điểm (point of interest) — chỉ cần x, y để đặt sprite và tính khoảng cách. `idleStaffZone` là một vùng — cần width để tính `startOffset` xếp hàng nhân viên không bị đứng đè.

- **Sidewalk sẽ tự mở rộng khi shop expand không?** Có — vì `drawSidewalk()` tính `sidewalkW` dựa trên `this.shopBounds.w`, và `shopBounds` được cập nhật trong `refreshEnvironment()` mỗi khi shop mở rộng. Đây là lý do tại sao thứ tự gọi trong `refreshEnvironment()` rất quan trọng.

---

*Blueprint version 1.0 — Cập nhật nếu có thay đổi offset hoặc kích thước zone.*