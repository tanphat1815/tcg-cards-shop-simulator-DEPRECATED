<script setup lang="ts">
import { computed } from 'vue'
import { useUIStore } from '../store/uiStore'
import { useGameStore } from '../store/gameStore'
import { useApiStore } from '../../inventory/store/apiStore'
import { useInventoryStore } from '../../inventory/store/inventoryStore'
import { useStatsStore } from '../../stats/store/statsStore'
import ManageEventApp from '../../events/components/ManageEventApp.vue'
import GradingServiceApp from '../../grading/components/GradingServiceApp.vue'
import SettingsApp from './SettingsApp.vue' // We will create this

const uiStore = useUIStore()
const gameStore = useGameStore()
const apiStore = useApiStore()
const inventoryStore = useInventoryStore()
const statsStore = useStatsStore()

const formattedTime = computed(() => {
  const mins = gameStore.timeInMinutes
  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours)
  return `${displayHours.toString().padStart(2, '0')}:${remainingMins.toString().padStart(2, '0')} ${ampm}`
})

function openApp(app: 'events' | 'grading' | 'settings') {
  uiStore.setActiveApp(app)
  
  if (app === 'grading') {
    // Hydrate cards for grading
    const binderIds = Object.keys(inventoryStore.personalBinder)
    if (binderIds.length > 0) {
      console.log(`[AdminTablet] Hydrating ${binderIds.length} cards for Grading app...`)
      apiStore.ensureCardsInCache(binderIds)
    }
  }
}

function closeTablet() {
  uiStore.toggleSmartphone(false)
}

function goHome() {
  uiStore.setActiveApp('home')
}
</script>

<template>
  <div v-if="uiStore.showSmartphone" class="tablet-overlay" @click.self="closeTablet">
    <div class="tablet-frame">
      <!-- Sidebar Navigation -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="logo">TCG Admin</div>
        </div>
        
        <nav class="nav-links">
          <button :class="{ active: uiStore.activeApp === 'home' }" @click="goHome">
            <span class="icon">🏠</span>
            <span class="label">Trang chủ</span>
          </button>
          
          <button :class="{ active: uiStore.activeApp === 'events' }" @click="openApp('events')">
            <span class="icon">🎮</span>
            <span class="label">Sự kiện</span>
          </button>
          
          <button :class="{ active: uiStore.activeApp === 'grading' }" @click="openApp('grading')">
            <span class="icon">🏆</span>
            <span class="label">Chấm điểm PSA</span>
          </button>
          
          <button :class="{ active: uiStore.activeApp === 'settings' }" @click="openApp('settings')">
            <span class="icon">⚙️</span>
            <span class="label">Cài đặt</span>
          </button>
        </nav>

        <div class="sidebar-footer">
          <div class="tablet-time">{{ formattedTime }}</div>
        </div>
      </aside>

      <!-- Main Screen Area -->
      <main class="viewport">
        <!-- Status Bar Top (Optional for more "Web" feel) -->
        <header class="viewport-header">
          <div class="breadcrumb">
            {{ uiStore.activeApp === 'home' ? 'Dashboard' : uiStore.activeApp.toUpperCase() }}
          </div>
          <button class="close-tablet-btn" @click="closeTablet">✕</button>
        </header>

        <div class="screen-content">
          <!-- Home Screen -->
          <div v-if="uiStore.activeApp === 'home'" class="dashboard">
            <div class="welcome-banner">
              <h1>Chào mừng trở lại, Manager</h1>
              <p>Hệ thống quản lý dịch vụ kỹ thuật số tập trung.</p>
            </div>
            
            <div class="quick-stats">
              <div class="stat-card">
                <span class="stat-label">Tiền mặt</span>
                <span class="stat-value money">${{ statsStore.money.toLocaleString() }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Cấp độ Shop</span>
                <span class="stat-value">Lv.{{ statsStore.level }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Ngày</span>
                <span class="stat-value">Thứ {{ statsStore.currentDay }}</span>
              </div>
            </div>

            <div class="apps-grid">
              <div class="app-card" @click="openApp('events')">
                <div class="app-icon event">🎮</div>
                <div class="app-info">
                  <h3>Sự kiện</h3>
                  <p>Quản lý các giải đấu và event tại shop.</p>
                </div>
              </div>
              
              <div class="app-card" @click="openApp('grading')">
                <div class="app-icon grading">🏆</div>
                <div class="app-info">
                  <h3>Chấm điểm thẻ</h3>
                  <p>Gửi thẻ đi PSA để tăng giá trị.</p>
                </div>
              </div>

              <div class="app-card" @click="openApp('settings')">
                <div class="app-icon settings">⚙️</div>
                <div class="app-info">
                  <h3>Cài đặt</h3>
                  <p>Điều khiển phím và đồ họa.</p>
                </div>
              </div>
            </div>
          </div>

          <!-- App Views -->
          <div v-else class="full-app-view">
            <ManageEventApp v-if="uiStore.activeApp === 'events'" :is-open="true" @close="goHome" />
            <GradingServiceApp v-if="uiStore.activeApp === 'grading'" :is-open="true" @close="goHome" />
            <SettingsApp v-if="uiStore.activeApp === 'settings'" @close="goHome" />
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.tablet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.tablet-frame {
  width: 1100px;
  height: 720px;
  background: #0f172a;
  border: 12px solid #1e293b;
  border-radius: 32px;
  display: flex;
  box-shadow: 0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.1);
  overflow: hidden;
  position: relative;
}

.sidebar {
  width: 240px;
  background: #1e293b;
  border-right: 1px solid rgba(255,255,255,0.05);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 32px 24px;
}

.logo {
  font-size: 1.5rem;
  font-weight: 800;
  color: #3b82f6;
  background: linear-gradient(to right, #3b82f6, #60a5fa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.nav-links {
  flex: 1;
  padding: 0 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-links button {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: transparent;
  border: none;
  border-radius: 12px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.nav-links button:hover {
  background: rgba(255,255,255,0.1);
  color: white;
}

.nav-links button.active {
  background: #3b82f6;
  color: white;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.nav-links .icon {
  font-size: 1.25rem;
}

.nav-links .label {
  font-weight: 500;
}

.sidebar-footer {
  padding: 24px;
  border-top: 1px solid rgba(255,255,255,0.05);
}

.tablet-time {
  color: #64748b;
  font-size: 0.9rem;
  font-weight: 600;
}

.viewport {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.viewport-header {
  height: 64px;
  padding: 0 32px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.breadcrumb {
  font-size: 0.85rem;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 1px;
}

.close-tablet-btn {
  background: rgba(255,255,255,0.05);
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.close-tablet-btn:hover {
  background: #ef4444;
  color: white;
}

.screen-content {
  flex: 1;
  overflow: hidden;
  background: #0f172a;
}

.dashboard {
  padding: 40px;
  display: flex;
  flex-direction: column;
  gap: 40px;
  height: 100%;
  overflow-y: auto;
}

.welcome-banner h1 {
  font-size: 2rem;
  color: white;
  margin-bottom: 8px;
}

.welcome-banner p {
  color: #94a3b8;
}

.quick-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.stat-card {
  background: #1e293b;
  padding: 24px;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid rgba(255,255,255,0.05);
}

.stat-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 700;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 800;
  color: white;
}

.stat-value.money { color: #10b981; }

.apps-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.app-card {
  background: #1e293b;
  padding: 24px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 20px;
  border: 1px solid rgba(255,255,255,0.05);
  cursor: pointer;
  transition: all 0.2s;
}

.app-card:hover {
  background: #334155;
  border-color: #3b82f6;
}

.app-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  box-shadow: 0 8px 16px rgba(0,0,0,0.3);
}

.app-icon.event { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
.app-icon.grading { background: linear-gradient(135deg, #f59e0b, #d97706); }
.app-icon.settings { background: linear-gradient(135deg, #64748b, #334155); }

.app-info h3 {
  color: white;
  margin-bottom: 4px;
}

.app-info p {
  color: #64748b;
  font-size: 0.85rem;
}

.full-app-view {
  height: 100%;
  width: 100%;
  position: relative;
}

/* Deep overrides for apps to fit inside Tablet */
:deep(.grading-app-panel), :deep(.event-app-panel) {
  border-radius: 0 !important;
  background: transparent !important;
}

:deep(.grading-app-overlay) {
  position: relative !important;
  height: 100% !important;
}
</style>
