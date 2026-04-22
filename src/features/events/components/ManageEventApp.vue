<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEventStore } from '../store/eventStore'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'



const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ close: [] }>()

const eventStore = useEventStore()

const showPicker = ref(false)


const availableEvents = computed(() => eventStore.unlockedEvents)

function selectEvent(id: string) {
  const result = eventStore.setNextEvent(id)
  if (result.success) {
    showPicker.value = false
  } else {
    alert(result.reason)
  }
}

function confirm() {
  // Already stored via setNextEvent — chỉ cần đóng
  emit('close')
}

function formatEffectLine(eff: { target: string; value: string; multiplier: number }) {
  const sign = eff.multiplier >= 1 ? '+' : '-'
  const color = eff.multiplier >= 1 ? 'positive' : 'negative'
  const emoji = eff.multiplier >= 1 ? '🟢' : '🔴'

  let desc = ''
  if (eff.target === 'RANDOM') {
    desc = 'Random cards'
  } else {
    desc = `${eff.value} cards`
  }
  return { sign, color, emoji, desc, mult: eff.multiplier }
}
</script>

<template>
  <div v-if="isOpen" class="smartphone-overlay">
    <div class="smartphone-frame">
      <!-- Header -->
      <header class="app-header">
        <h2>🎮 Manage Event</h2>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <!-- Picker Modal (Edit) -->
      <div v-if="showPicker" class="picker-sheet">
        <h3>Chọn sự kiện cho ngày mai:</h3>
        <ul class="event-list">
          <li
            v-for="ev in availableEvents" :key="ev.id"
            :class="{ current: ev.id === eventStore.nextEventId }"
            @click="selectEvent(ev.id)"
          >
            <span class="icon">{{ ev.icon }}</span>
            <span class="name">{{ ev.name }}</span>
            <span class="cost">
              <span class="cost-day">${{ ev.dailyCost }}/day</span>
              <span class="cost-hr">${{ ev.hourlyFee }}/hr</span>
            </span>
          </li>
        </ul>
        <EnhancedButton variant="secondary" size="md" fullWidth @click="showPicker = false">
          Huỷ
        </EnhancedButton>
      </div>

      <!-- Main View -->
      <div v-else class="app-body">
        <!-- Next Event Card -->
        <section v-if="eventStore.nextEvent" class="event-card next">
          <div class="card-title">
            <span class="tag-next">NEXT DAY</span>
            <h3>{{ eventStore.nextEvent.icon }} {{ eventStore.nextEvent.name }}</h3>
            <p>{{ eventStore.nextEvent.format }}</p>
          </div>

          <div class="card-stats">
            <div>
              <span class="label">Fee</span>
              <span class="value">${{ eventStore.nextEvent.hourlyFee }}/hr</span>
            </div>
            <div>
              <span class="label">Cost</span>
              <span class="value">${{ eventStore.nextEvent.dailyCost }}/day</span>
            </div>
          </div>

          <p class="card-desc">{{ eventStore.nextEvent.description }}</p>

          <!-- Effects -->
          <div class="effects-list">
            <h4>Possible Effects:</h4>
            <div
              v-for="(eff, idx) in eventStore.nextEvent.effects" :key="idx"
              class="effect-row"
              :class="formatEffectLine(eff).color"
            >
              <span class="effect-emoji">{{ formatEffectLine(eff).emoji }}</span>
              <span class="effect-text">
                {{ formatEffectLine(eff).sign }} {{ formatEffectLine(eff).desc }}
              </span>
              <span class="effect-mult">×{{ formatEffectLine(eff).mult }}</span>
            </div>
          </div>

          <EnhancedButton
            variant="primary" size="md" fullWidth
            @click="showPicker = true"
          >
            Edit Event
          </EnhancedButton>
        </section>

        <!-- Today's Status -->
        <section v-if="eventStore.activeEvent" class="today-card">
          <div class="today-header">
            <span class="today-label">TODAY</span>
            <h4>{{ eventStore.activeEvent.icon }} {{ eventStore.activeEvent.name }}</h4>
          </div>
          <div class="today-stats">
            <div>
              <span class="stat-label">Revenue today</span>
              <span class="stat-value">${{ eventStore.eventRevenueToday.toFixed(2) }}</span>
            </div>
            <div>
              <span class="stat-label">Players paid</span>
              <span class="stat-value">{{ eventStore.playersPaidToday }}</span>
            </div>
          </div>
        </section>

        <!-- Counter -->
        <div class="total-hosted">
          Total Players Hosted:
          <strong>{{ eventStore.totalPlayersHosted }}</strong>
        </div>

        <!-- Confirm btn -->
        <EnhancedButton variant="success" size="lg" fullWidth @click="confirm">
          Confirm Event
        </EnhancedButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.smartphone-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 300;
  display: flex; align-items: center; justify-content: center;
}

.smartphone-frame {
  width: 380px; max-width: 90vw;
  max-height: 85vh;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border: 3px solid #334155;
  border-radius: 28px;
  overflow: hidden;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}

.app-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid #334155;
}
.app-header h2 { color: #f1f5f9; margin: 0; font-size: 1.1rem; }
.close {
  background: transparent; border: none;
  color: #94a3b8; font-size: 1.3rem; cursor: pointer;
}

.app-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  display: flex; flex-direction: column; gap: 16px;
}

.event-card {
  background: rgba(51, 65, 85, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 14px;
  padding: 16px;
}

.event-card.next { border-color: #3b82f6; }

.tag-next {
  display: inline-block;
  font-size: 0.65rem;
  background: #3b82f6; color: white;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 700;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.card-title h3 {
  color: #f1f5f9;
  margin: 0;
  font-size: 1.3rem;
}
.card-title p { color: #94a3b8; margin: 2px 0 0; font-size: 0.85rem; }

.card-stats {
  display: flex; gap: 16px;
  margin: 12px 0;
  padding: 10px 0;
  border-top: 1px dashed rgba(148, 163, 184, 0.2);
  border-bottom: 1px dashed rgba(148, 163, 184, 0.2);
}
.card-stats > div { flex: 1; display: flex; flex-direction: column; }
.card-stats .label { color: #94a3b8; font-size: 0.75rem; }
.card-stats .value { color: #fbbf24; font-weight: 700; font-size: 1rem; }

.card-desc { color: #cbd5e1; font-size: 0.85rem; margin: 8px 0; }

.effects-list { margin-top: 10px; }
.effects-list h4 { color: #94a3b8; font-size: 0.8rem; margin-bottom: 6px; }
.effect-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.85rem;
  margin-bottom: 4px;
}
.effect-row.positive { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; }
.effect-row.negative { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
.effect-mult { margin-left: auto; font-weight: 700; }

.today-card {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 10px;
  padding: 12px;
}
.today-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px;
}
.today-label {
  font-size: 0.6rem;
  background: #10b981; color: white;
  padding: 2px 6px; border-radius: 999px;
  font-weight: 700;
}
.today-header h4 { color: #f1f5f9; margin: 0; font-size: 0.95rem; }
.today-stats { display: flex; gap: 14px; }
.today-stats > div { flex: 1; display: flex; flex-direction: column; }
.stat-label { color: #94a3b8; font-size: 0.7rem; }
.stat-value { color: #fbbf24; font-weight: 700; }

.total-hosted {
  text-align: center;
  color: #cbd5e1;
  font-size: 0.85rem;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}
.total-hosted strong { color: #fbbf24; }

.picker-sheet {
  padding: 16px;
  overflow-y: auto;
}
.event-list {
  list-style: none; padding: 0;
  display: flex; flex-direction: column; gap: 8px;
  margin-bottom: 16px;
}
.event-list li {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: rgba(51, 65, 85, 0.4);
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.event-list li:hover { background: rgba(51, 65, 85, 0.8); border-color: #3b82f6; }
.event-list li.current { border-color: #10b981; background: rgba(16, 185, 129, 0.15); }
.event-list .icon { font-size: 1.3rem; }
.event-list .name { color: #f1f5f9; flex: 1; }
.event-list .cost { display: flex; flex-direction: column; align-items: flex-end; font-size: 0.75rem; }
.event-list .cost-day { color: #ef4444; }
.event-list .cost-hr { color: #10b981; }
</style>
