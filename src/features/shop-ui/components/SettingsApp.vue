<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useStatsStore } from '../../stats/store/statsStore'

const statsStore = useStatsStore()
const emit = defineEmits<{ close: [] }>()

const activeTab = ref<'general' | 'keyboard'>('general')
const rebindingKey = ref<string | null>(null)

const controlLabels: Record<string, string> = {
  MOVE_UP: 'Di chuyển Lên',
  MOVE_LEFT: 'Di chuyển Trái',
  MOVE_DOWN: 'Di chuyển Xuống',
  MOVE_RIGHT: 'Di chuyển Phải',
  INTERACT: 'Tương tác chính (E)',
  BUILD_MENU: 'Menu Xây dựng/Trang trí (X)',
  POCKET_MENU: 'Mở Túi đồ/Binder (B)',
  ONLINE_SHOP: 'Mở Shop Online (TAB)',
  PICKUP_ITEM: 'Nhặt đồ vật (F)',
  DROP_ITEM: 'Đặt đồ vật xuống (F)',
  ROTATE_FURNITURE: 'Xoay nội thất (R)'
}

function startRebind(keyId: string) {
  rebindingKey.value = keyId
  window.addEventListener('keydown', handleKeyDown)
}

function handleKeyDown(event: KeyboardEvent) {
  if (!rebindingKey.value) return
  
  event.preventDefault()
  const newKey = event.key.toUpperCase()
  
  // Update the control
  if (statsStore.settings.controls) {
    (statsStore.settings.controls as any)[rebindingKey.value] = newKey
  }
  
  rebindingKey.value = null
  window.removeEventListener('keydown', handleKeyDown)
}

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

const togglePreview = () => {
  statsStore.settings.showExpansionPreview = !statsStore.settings.showExpansionPreview
}

const setStyle = (style: 'BLUEPRINT' | 'GLOW') => {
  statsStore.settings.expansionPreviewStyle = style
}
</script>

<template>
  <div class="settings-app">
    <div class="settings-tabs">
      <button :class="{ active: activeTab === 'general' }" @click="activeTab = 'general'">Cài đặt chung</button>
      <button :class="{ active: activeTab === 'keyboard' }" @click="activeTab = 'keyboard'">Điều khiển bàn phím</button>
    </div>

    <div class="settings-content custom-scrollbar">
      <!-- General Settings -->
      <div v-if="activeTab === 'general'" class="tab-pane">
        <section class="settings-group">
          <h3>Hiển thị</h3>
          <div class="setting-item">
            <div class="info">
              <span class="label">Vùng mở rộng</span>
              <span class="description">Hiển thị ranh giới cửa hàng khi mua đất mới.</span>
            </div>
            <button class="toggle" :class="{ on: statsStore.settings.showExpansionPreview }" @click="togglePreview">
              <span class="knob"></span>
            </button>
          </div>

          <div v-if="statsStore.settings.showExpansionPreview" class="style-picker">
            <button :class="{ selected: statsStore.settings.expansionPreviewStyle === 'BLUEPRINT' }" @click="setStyle('BLUEPRINT')">
              Blueprint
            </button>
            <button :class="{ selected: statsStore.settings.expansionPreviewStyle === 'GLOW' }" @click="setStyle('GLOW')">
              Glow Effect
            </button>
          </div>

          <div class="setting-item">
            <div class="info">
              <span class="label">Debug Physics</span>
              <span class="description">Hiện khung va chạm vật lý (Collision Box).</span>
            </div>
            <button class="toggle" :class="{ on: statsStore.settings.showDebugPhysics }" @click="statsStore.settings.showDebugPhysics = !statsStore.settings.showDebugPhysics">
              <span class="knob"></span>
            </button>
          </div>
        </section>
      </div>

      <!-- Keyboard Settings -->
      <div v-if="activeTab === 'keyboard'" class="tab-pane">
        <section class="settings-group">
          <h3>Phím tắt tương tác</h3>
          <div class="controls-list">
            <div v-for="(label, id) in controlLabels" :key="id" class="control-item">
              <span class="control-label">{{ label }}</span>
              <button class="key-cap" :class="{ rebinding: rebindingKey === id }" @click="startRebind(id as string)">
                {{ rebindingKey === id ? '...' : (statsStore.settings.controls as any)[id] }}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>

    <div v-if="rebindingKey" class="rebind-overlay">
      <div class="rebind-dialog">
        <h2>Nhấn phím bất kỳ để gán cho <span>{{ controlLabels[rebindingKey] }}</span></h2>
        <p>Nhấn ESC để hủy</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-app {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.settings-tabs {
  display: flex;
  padding: 20px 40px;
  gap: 20px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.settings-tabs button {
  background: transparent;
  border: none;
  color: #64748b;
  font-weight: 700;
  font-size: 0.9rem;
  padding: 8px 16px;
  cursor: pointer;
  position: relative;
}

.settings-tabs button.active {
  color: #3b82f6;
}

.settings-tabs button.active::after {
  content: '';
  position: absolute;
  bottom: -20px;
  left: 0;
  width: 100%;
  height: 2px;
  background: #3b82f6;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 40px;
}

.tab-pane {
  max-width: 600px;
  margin: 0 auto;
}

.settings-group {
  margin-bottom: 40px;
}

.settings-group h3 {
  color: white;
  font-size: 1.1rem;
  margin-bottom: 24px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.setting-item .info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-item .label {
  color: white;
  font-weight: 600;
}

.setting-item .description {
  color: #64748b;
  font-size: 0.85rem;
}

.toggle {
  width: 44px;
  height: 24px;
  background: #334155;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  position: relative;
  transition: background 0.3s;
}

.toggle.on {
  background: #10b981;
}

.toggle .knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform 0.3s;
}

.toggle.on .knob {
  transform: translateX(20px);
}

.style-picker {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.style-picker button {
  flex: 1;
  padding: 12px;
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 8px;
  color: #94a3b8;
  cursor: pointer;
}

.style-picker button.selected {
  border-color: #3b82f6;
  color: white;
  background: rgba(59, 130, 246, 0.1);
}

/* Keyboard List */
.controls-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #1e293b;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.05);
}

.control-label {
  color: #94a3b8;
  font-weight: 500;
}

.key-cap {
  background: #334155;
  border: 1px solid #475569;
  border-radius: 6px;
  color: white;
  font-weight: 800;
  min-width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-family: monospace;
  font-size: 1.2rem;
  box-shadow: 0 4px 0 #1e293b;
  transition: all 0.1s;
}

.key-cap:active {
  transform: translateY(2px);
  box-shadow: 0 2px 0 #1e293b;
}

.key-cap.rebinding {
  border-color: #3b82f6;
  color: #3b82f6;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.rebind-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.rebind-dialog {
  text-align: center;
}

.rebind-dialog h2 {
  color: white;
  margin-bottom: 12px;
}

.rebind-dialog h2 span {
  color: #3b82f6;
}

.rebind-dialog p {
  color: #64748b;
}
</style>
