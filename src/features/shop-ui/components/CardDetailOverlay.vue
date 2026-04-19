<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCardDetailStore } from '../../inventory/store/cardDetailStore'
import PokemonCard3D from '../../shared/components/PokemonCard3D.vue'
import { getSetSymbolUrl } from '../../inventory/utils/expansionUtils'
import { getSetCode } from '../../inventory/config/setMappings'
import { watch } from 'vue'

const store = useCardDetailStore()
const showRawJson = ref(false)
const symbolError = ref(false)

const card = computed(() => store.selectedCard)

// Reset error state when card changes
watch(() => card.value?.id, () => {
  symbolError.value = false
})

const expansionBadge = computed(() => {
  if (!card.value?.set_id) return null
  return getSetCode(card.value.set_id)
})

const symbolUrl = computed(() => {
  if (!card.value?.series_id || !card.value?.set_id || symbolError.value) return null
  return getSetSymbolUrl(card.value.series_id, card.value.set_id)
})

function handleSymbolError() {
  symbolError.value = true
}

function toggleRawJson() {
  showRawJson.value = !showRawJson.value
}

const safeJson = computed(() => {
  if (!card.value) return ''
  const cache = new Set()
  return JSON.stringify(card.value, (_, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) return '[Circular]'
      cache.add(value)
    }
    return value
  }, 2)
})

function close() {
  store.closeCard()
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && store.isOpen) {
    close()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

function getMarketPrice(card: any): string {
  const price = card?.pricing?.tcgplayer?.normal?.marketPrice ?? card?.pricing?.cardmarket?.avg ?? 'N/A';
  return price !== 'N/A' ? `$${Number(price).toFixed(2)}` : 'N/A';
}

function getRawPrice(card: any): number {
  const price = card?.pricing?.tcgplayer?.normal?.marketPrice ?? card?.pricing?.cardmarket?.avg ?? 0;
  return Number(price);
}

const formatVND = (priceUsd: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(priceUsd * 25000)
}
</script>

<template>
  <Transition name="fade">
    <div v-if="store.isOpen && card" class="detail-overlay" @click.self="close">
      <div class="main-wrapper">
        <button class="close-float-btn" @click="close">×</button>

        <div class="content-layout">
          <!-- LEFT: 3D CARD VISUAL -->
          <div class="visual-pane">
            <PokemonCard3D :card="card" width="440px" />
            
            <div class="market-price-tag group relative cursor-help">
              <span class="price-label">Market Price</span>
              <span class="price-value">{{ getMarketPrice(card) }}</span>
              
              <!-- VND Tooltip -->
              <div v-if="getRawPrice(card) > 0" class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-max bg-slate-900 text-white text-sm font-bold rounded-lg px-4 py-2 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none border border-slate-700 font-mono tracking-wider">
                <span class="text-emerald-400">{{ formatVND(getRawPrice(card)) }}</span>
                <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45 border-r border-b border-slate-700"></div>
              </div>
            </div>
          </div>

          <!-- RIGHT: OFFICIAL STYLE INFO PANEL -->
          <div class="info-pane">
            <!-- Header Section -->
            <header class="card-header-bar">
              <div class="header-main">
                <h1 class="pokemon-name">{{ card.name }}</h1>
              </div>
              <div class="header-sub">
                <span v-if="card.stage" class="stage-info">{{ card.stage }}</span>
                <span v-else class="stage-info">{{ card.supertype }}</span>
                
                <div class="hp-and-type" v-if="card.hp">
                  <span class="hp-label">HP</span>
                  <span class="hp-value">{{ card.hp }}</span>
                  <div class="type-badge-circle" 
                       v-for="t in card.types" :key="t"
                       :class="'icon-' + t.toLowerCase()">
                  </div>
                </div>
              </div>
              <div v-if="card.evolveFrom" class="evolution-info">
                Evolves From: <span class="evo-name">{{ card.evolveFrom }}</span>
              </div>
            </header>

            <div class="scrollable-body custom-scrollbar">
              <!-- Abilities -->
              <div v-if="card.abilities && card.abilities.length > 0" class="section abilities-section">
                <div v-for="ability in card.abilities" :key="ability.name" class="ability-block">
                  <span class="ability-label">Ability</span>
                  <h2 class="ability-name">{{ ability.name }}</h2>
                  <p class="ability-description">{{ ability.text || ability.effect }}</p>
                </div>
              </div>

              <!-- Attacks -->
              <div v-if="card.attacks && card.attacks.length > 0" class="section attacks-section">
                <div v-for="attack in card.attacks" :key="attack.name" class="attack-block">
                  <div class="attack-row-top">
                    <div class="energy-costs">
                      <div v-for="(cost, idx) in attack.cost" :key="idx" 
                           class="energy-mini-icon"
                           :class="'icon-' + cost.toLowerCase()">
                      </div>
                    </div>
                    <span class="attack-name">{{ attack.name }}</span>
                    <span class="attack-damage">{{ attack.damage }}</span>
                  </div>
                  <p class="attack-description">{{ attack.text || attack.effect }}</p>
                </div>
              </div>

              <!-- Trainer/Energy Description -->
              <div v-if="!card.attacks?.length && card.description" class="section text-description">
                <p class="main-text">{{ card.description }}</p>
              </div>

              <!-- Stats Boxes (Weakness, Resistance, Retreat) -->
              <div class="stats-grid-footer">
                <div class="stat-col">
                  <h3 class="stat-title">Weakness</h3>
                  <div class="stat-content">
                    <div v-for="w in card.weaknesses" :key="w.type" class="stat-pill">
                      <div class="energy-mini-icon" :class="'icon-' + w.type.toLowerCase()"></div>
                      <span class="stat-value">{{ w.value }}</span>
                    </div>
                    <span v-if="!card.weaknesses?.length" class="stat-none">None</span>
                  </div>
                </div>

                <div class="stat-col">
                  <h3 class="stat-title">Resistance</h3>
                  <div class="stat-content">
                    <div v-for="r in card.resistances" :key="r.type" class="stat-pill">
                      <div class="energy-mini-icon" :class="'icon-' + r.type.toLowerCase()"></div>
                      <span class="stat-value">{{ r.value }}</span>
                    </div>
                    <span v-if="!card.resistances?.length" class="stat-none">None</span>
                  </div>
                </div>

                <div class="stat-col">
                  <h3 class="stat-title">Retreat Cost</h3>
                  <div class="stat-content energy-costs">
                    <template v-if="card.retreatCost && card.retreatCost > 0">
                      <div v-for="n in Number(card.retreatCost)" :key="n" 
                           class="energy-mini-icon icon-colorless">
                      </div>
                    </template>
                    <span v-else class="stat-none">None</span>
                  </div>
                </div>
              </div>

              <!-- Set Info Footer -->
              <div class="set-info-footer">
                <div class="set-details-row">
                  <div class="expansion-badge-container">
                    <!-- Try Symbol Icon first -->
                    <img v-if="symbolUrl" 
                         :src="symbolUrl" 
                         class="expansion-symbol" 
                         @error="handleSymbolError" />
                    
                    <!-- Fallback to Text Badge if symbol fails or available -->
                    <span v-else-if="expansionBadge" class="expansion-text-badge">
                      {{ expansionBadge }}
                    </span>
                  </div>

                  <div class="set-details-text">
                    <span class="set-name-link">{{ card.set_name }}</span>
                    <span class="card-number-meta">{{ card.number }}/{{ card.set_cardCount || '??' }} {{ card.rarity }}</span>
                  </div>
                </div>
                <!-- Pro icons or rarity icons could go here -->
                <div v-if="card.artist" class="illustrator-line">
                  Illustrator: <span class="artist-name">{{ card.artist }}</span>
                </div>
              </div>

              <!-- Debug JSON toggle -->
              <button class="raw-json-toggle" @click="toggleRawJson">
                {{ showRawJson ? '[ HIDE RAW DATA ]' : '[ VIEW RAW DATA ]' }}
              </button>
              <div v-if="showRawJson" class="raw-data-panel">
                <pre>{{ safeJson }}</pre>
              </div>
            </div>
            
            <div class="footer-actions">
              <button class="close-main-btn" @click="close">BACK TO SHOP</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Main Container */
.detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(20px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  font-family: 'Exo 2', sans-serif;
}

.main-wrapper {
  position: relative;
  width: 100%;
  max-width: 1200px;
  animation: overlayIn 0.5s cubic-bezier(0.19, 1, 0.22, 1);
}

@keyframes overlayIn {
  from { opacity: 0; translate: 0 40px; filter: blur(10px); }
  to { opacity: 1; translate: 0 0; filter: blur(0); }
}

.close-float-btn {
  position: absolute;
  top: -3rem;
  right: 0;
  background: none;
  border: none;
  color: white;
  font-size: 3rem;
  cursor: pointer;
  opacity: 0.7;
  transition: all 0.2s;
}
.close-float-btn:hover { opacity: 1; scale: 1.1; }

.content-layout {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 3rem;
  align-items: flex-start;
}

/* Visual Pane */
.visual-pane {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
}

.market-price-tag {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.75rem 2rem;
  border-radius: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.price-label { font-size: 0.7rem; text-transform: uppercase; color: #94a3b8; font-weight: 800; }
.price-value { font-size: 1.5rem; font-weight: 900; color: #10b981; }

/* Info Pane */
.info-pane {
  background: #ffffff;
  border-radius: 20px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #1e293b;
  box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.5);
}

/* Header Bar */
.card-header-bar {
  background: #f1f5f9;
  padding: 1.5rem 2rem;
  border-bottom: 2px solid #e2e8f0;
}
.pokemon-name { font-size: 2.25rem; font-weight: 900; color: #334155; margin-bottom: 0.25rem; }
.header-sub { display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; }
.stage-info { font-size: 1.1rem; font-weight: 700; color: #64748b; }
.hp-and-type { display: flex; align-items: baseline; gap: 0.25rem; }
.hp-label { font-size: 0.8rem; font-weight: 900; color: #ef4444; }
.hp-value { font-size: 1.5rem; font-weight: 900; color: #334155; }
.type-badge-circle {
  margin-left: 0.5rem;
  box-shadow: inset 0 -2px 4px rgba(0,0,0,0.3);
}
.evolution-info { margin-top: 0.75rem; font-size: 0.9rem; color: #64748b; font-weight: 600; }
.evo-name { color: #2563eb; cursor: pointer; }
.evo-name:hover { text-decoration: underline; }

/* Scrollable Body */
.scrollable-body {
  padding: 2rem;
  overflow-y: auto;
  flex-grow: 1;
}

.section { margin-bottom: 2.5rem; }

/* Abilities */
.ability-block { margin-bottom: 1.5rem; }
.ability-label { color: #e11d48; font-weight: 800; font-size: 1.1rem; display: block; margin-bottom: 0.25rem; }
.ability-name { font-size: 1.5rem; font-weight: 900; margin-bottom: 0.5rem; color: #0f172a; }
.ability-description { font-size: 1rem; line-height: 1.6; color: #475569; }

/* Attacks */
.attack-block { margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid #f1f5f9; }
.attack-row-top { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
.energy-costs { display: flex; gap: 4px; }
.energy-mini-icon {
  box-shadow: inset 0 -1.5px 3px rgba(0,0,0,0.2);
}
.attack-name { font-size: 1.35rem; font-weight: 900; flex-grow: 1; color: #0f172a; }
.attack-damage { font-size: 1.35rem; font-weight: 900; color: #334155; }
.attack-description { font-size: 0.95rem; color: #64748b; line-height: 1.6; padding-left: 2px; }

/* Footer Stats Grid */
.stats-grid-footer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  background: #f8fafc;
  border-radius: 12px;
  padding: 1.5rem;
  gap: 1.5rem;
  margin-bottom: 2.5rem;
}
.stat-col { display: flex; flex-direction: column; gap: 0.75rem; }
.stat-title { font-size: 0.85rem; color: #94a3b8; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
.stat-content { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; min-height: 24px; }
.stat-pill { display: flex; align-items: center; gap: 0.4rem; }
.stat-value { font-weight: 800; color: #334155; }
.stat-none { color: #cbd5e1; font-weight: 600; font-size: 0.9rem; }

/* Global Set/Info Footer */
.set-info-footer { 
  border-top: 2px solid #f1f5f9; 
  padding-top: 1.5rem; 
  display: flex; 
  flex-direction: column; 
  gap: 1rem; 
}

.set-details-row {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.expansion-badge-container {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
}

.expansion-symbol {
  height: 50px;
  width: auto;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
  transition: all 0.3s ease;
}

.expansion-symbol:hover {
  transform: scale(1.1);
}


.expansion-text-badge {
  background: #1e293b;
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 900;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.1);
}

.set-details-text { 
  display: flex; 
  flex-direction: column; 
  gap: 0.25rem; 
}
.set-name-link { color: #2563eb; font-weight: 800; font-size: 1.1rem; }
.card-number-meta { color: #64748b; font-weight: 600; font-size: 0.9rem; }
.illustrator-line { color: #94a3b8; font-size: 0.85rem; font-weight: 600; }
.artist-name { color: #2563eb; cursor: pointer; text-decoration: underline; }

/* Final Actions */
.footer-actions { padding: 1.5rem 2rem; background: #ffffff; border-top: 1px solid #f1f5f9; }
.close-main-btn {
  width: 100%;
  padding: 1.25rem;
  background: #1e293b;
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 900;
  font-size: 1rem;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
}
.close-main-btn:hover { background: #0f172a; scale: 1.02; box-shadow: 0 10px 20px rgba(0,0,0,0.2); }

/* RAW Data */
.raw-json-toggle {
  display: block;
  margin: 2rem auto 1rem;
  background: none;
  border: 1px dashed #cbd5e1;
  color: #94a3b8;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-family: monospace;
  font-size: 0.7rem;
  cursor: pointer;
}
.raw-data-panel { background: #0f172a; padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem; }
.raw-data-panel pre { color: #34d399; font-size: 0.75rem; white-space: pre-wrap; overflow-x: auto; }

/* Scrollbar Style */
.custom-scrollbar::-webkit-scrollbar { width: 8px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; border: 2px solid #ffffff; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }

@media (max-width: 1024px) {
  .content-layout { grid-template-columns: 1fr; gap: 2rem; justify-items: center; }
  .info-pane { max-height: none; width: 100%; max-width: 600px; }
  .detail-overlay { overflow-y: auto; padding: 4rem 1rem 2rem; }
}

/* Colorless fallback or unknown */
.colorless { background: #dde2e2; }
</style>
