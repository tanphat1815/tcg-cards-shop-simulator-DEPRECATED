<script setup lang="ts">
import { computed } from 'vue'
import { useUIStore } from '../store/uiStore'
import { useGameStore } from '../store/gameStore'
import ManageEventApp from '../../events/components/ManageEventApp.vue'
import GradingServiceApp from '../../grading/components/GradingServiceApp.vue'

const uiStore = useUIStore()
const gameStore = useGameStore()

const formattedTime = computed(() => {
  const mins = gameStore.timeInMinutes
  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours)
  return `${displayHours.toString().padStart(2, '0')}:${remainingMins.toString().padStart(2, '0')} ${ampm}`
})

function openApp(app: 'events' | 'grading') {
  uiStore.setActiveApp(app)
}

function closeSmartphone() {
  uiStore.toggleSmartphone(false)
}

function goHome() {
  uiStore.setActiveApp('home')
}
</script>

<template>
  <div v-if="uiStore.showSmartphone" class="smartphone-overlay" @click.self="closeSmartphone">
    <div class="smartphone-container">
      <!-- Status Bar -->
      <div class="status-bar">
        <span class="time">{{ formattedTime }}</span>
        <div class="status-icons">
          <span>📶</span>
          <span>🔋 88%</span>
        </div>
      </div>

      <!-- Content Area -->
      <div class="screen-content">
        <!-- Home Screen -->
        <div v-if="uiStore.activeApp === 'home'" class="home-screen">
          <h1 class="welcome-text">Good day, Manager</h1>
          
          <div class="apps-grid">
            <button class="app-icon-wrapper" @click="openApp('events')">
              <div class="app-icon events">🎮</div>
              <span class="app-label">Events</span>
            </button>
            
            <button class="app-icon-wrapper" @click="openApp('grading')">
              <div class="app-icon grading">🏆</div>
              <span class="app-label">Grading</span>
            </button>
            
            <!-- Future apps can be added here -->
            <div class="app-icon-wrapper disabled">
              <div class="app-icon coming-soon">⚙️</div>
              <span class="app-label">Settings</span>
            </div>
          </div>
        </div>

        <!-- Apps Integration -->
        <div v-else class="app-view">
          <ManageEventApp v-if="uiStore.activeApp === 'events'" :is-open="true" @close="goHome" />
          <GradingServiceApp v-if="uiStore.activeApp === 'grading'" :is-open="true" @close="goHome" />
        </div>
      </div>

      <!-- Navigation Bar -->
      <div class="nav-bar">
        <button class="nav-btn" @click="goHome">●</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.smartphone-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
}

.smartphone-container {
  width: 360px;
  height: 720px;
  background: #111;
  border: 12px solid #333;
  border-radius: 40px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 50px 100px rgba(0,0,0,0.8), 0 0 0 2px #444;
}

.status-bar {
  height: 30px;
  padding: 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: white;
  z-index: 10;
}

.screen-content {
  flex: 1;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  position: relative;
  overflow: hidden;
}

.home-screen {
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.welcome-text {
  color: white;
  font-size: 1.2rem;
  font-weight: 300;
  margin-bottom: 40px;
  opacity: 0.8;
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  width: 100%;
}

.app-icon-wrapper {
  background: none;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.2s;
}

.app-icon-wrapper:active {
  transform: scale(0.9);
}

.app-icon {
  width: 60px;
  height: 60px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.3);
}

.app-icon.events { background: linear-gradient(45deg, #3b82f6, #1d4ed8); }
.app-icon.grading { background: linear-gradient(45deg, #f59e0b, #d97706); }
.app-icon.coming-soon { background: #334155; opacity: 0.5; }

.app-label {
  color: white;
  font-size: 12px;
  font-weight: 500;
}

.app-view {
  height: 100%;
  width: 100%;
}

/* Deep override for apps to fit inside the screen */
:deep(.smartphone-frame) {
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  max-height: 100% !important;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  position: relative !important;
  inset: auto !important;
}

:deep(.smartphone-overlay), :deep(.grading-app-overlay) {
  position: relative !important;
  background: none !important;
  backdrop-filter: none !important;
  z-index: 1 !important;
}

:deep(.grading-app-panel) {
  width: 100% !important;
  height: 100% !important;
  border-radius: 0 !important;
  border: none !important;
}

.nav-bar {
  height: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #111;
}

.nav-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #333;
  border: 1px solid #444;
  color: transparent;
  cursor: pointer;
}

.nav-btn:hover {
  background: #444;
}
</style>
