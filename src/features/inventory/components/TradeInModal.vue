<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useTradeInStore } from '../store/tradeInStore'
import { useApiStore } from '../store/apiStore'
import { useGameStore } from '../../shop-ui/store/gameStore'
import { eventBus } from '../../shared/EventBus'

const tradeStore = useTradeInStore()
const apiStore = useApiStore()
const gameStore = useGameStore()

const offerInput = ref<string>('')

// Card data lấy từ apiStore
const cardData = computed(() => {
  const id = tradeStore.activeTrade?.cardId
  if (!id) return null
  return apiStore.flatCardMap[id] ?? null
})

// Reset input khi modal mới mở
watch(() => tradeStore.showModal, (open) => {
  if (open && tradeStore.activeTrade) {
    offerInput.value = (tradeStore.activeTrade.currentCounterPrice ?? tradeStore.activeTrade.askPrice).toFixed(2)
  }
})

function submit() {
  const price = parseFloat(offerInput.value)
  if (isNaN(price)) return
  tradeStore.submitOffer(price)
}

function reject() {
  tradeStore.rejectTrade()
}

function close() {
  tradeStore.closeModal()
}

const isDealClosed = computed(() =>
  tradeStore.activeTrade?.phase === 'ACCEPTED' ||
  tradeStore.activeTrade?.phase === 'REJECTED'
)

const currentAskPrice = computed(() => {
  const t = tradeStore.activeTrade
  if (!t) return 0
  return t.currentCounterPrice ?? t.askPrice
})

function getCardImageUrl(card: any) {
  return card.images?.small || card.images?.large || ''
}
</script>

<template>
  <Transition name="premium-modal">
    <div v-if="tradeStore.showModal && cardData" class="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6">
      <!-- Backdrop with premium blur -->
      <div class="absolute inset-0 bg-slate-950/80 backdrop-blur-xl" @click="close"></div>

      <div class="relative w-full max-w-4xl bg-slate-900/90 border border-white/10 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col md:flex-row">
        <!-- Shine effect top corner -->
        <div class="absolute -top-32 -left-32 w-80 h-80 bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none"></div>
        <div class="absolute -bottom-32 -right-32 w-80 h-80 bg-rose-500/20 rounded-full blur-[100px] pointer-events-none"></div>

        <!-- Left Column: Visuals -->
        <div class="w-full md:w-[40%] bg-white/5 p-8 flex flex-col items-center justify-center gap-8 border-b md:border-b-0 md:border-r border-white/5">
          <div class="relative group perspective-1000">
             <div class="relative z-10 w-full max-w-[280px] aspect-[2/3] bg-slate-800 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 transition-transform duration-500 group-hover:rotate-y-12">
               <img :src="getCardImageUrl(cardData)" class="w-full h-full object-contain" />
               <div class="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
             </div>
             <!-- Rarity Label Float -->
             <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 px-6 py-2 bg-slate-950 border border-white/10 rounded-full shadow-2xl z-20">
                <span class="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] italic">{{ cardData.rarity || 'Common' }}</span>
             </div>
             
             <!-- Glow background -->
             <div class="absolute inset-0 bg-indigo-500/30 blur-[60px] opacity-0 group-hover:opacity-40 transition-opacity duration-500 rounded-full"></div>
          </div>

          <div class="w-full space-y-4">
            <div class="p-4 bg-slate-950/40 rounded-2xl border border-white/5 backdrop-blur-sm">
              <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Market Value</p>
              <p class="text-2xl font-black text-white italic">${{ tradeStore.activeTrade?.marketPrice.toFixed(2) }}</p>
            </div>
            <div class="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20 backdrop-blur-sm">
              <p class="text-[10px] text-amber-500 font-bold uppercase tracking-widest mb-1">NPC Seeking</p>
              <p class="text-2xl font-black text-amber-400 italic">${{ currentAskPrice.toFixed(2) }}</p>
            </div>
          </div>
        </div>

        <!-- Right Column: Negotiation -->
        <div class="flex-1 p-8 md:p-12 flex flex-col gap-8">
          <div class="flex justify-between items-start">
            <div>
              <h2 class="text-4xl font-black text-white leading-none tracking-tight">{{ cardData.name }}</h2>
              <p class="text-slate-500 font-bold uppercase tracking-widest text-xs mt-3 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
                {{ cardData.set.name }} #{{ cardData.number }}
              </p>
            </div>
            <button @click="close" class="w-12 h-12 rounded-full flex items-center justify-center bg-white/5 hover:bg-rose-500/20 text-slate-500 hover:text-rose-500 transition-all">
              <span class="text-3xl">&times;</span>
            </button>
          </div>

          <!-- NPC Message Bubble -->
          <div class="relative p-6 bg-slate-950/50 rounded-3xl border border-white/5 shadow-inner">
             <div class="absolute -top-3 left-8 px-3 py-1 bg-indigo-600 rounded-full text-[9px] font-black uppercase text-white tracking-widest">NPC Message</div>
             <p class="text-slate-300 italic leading-relaxed text-lg pt-2">
                "{{ tradeStore.activeTrade?.statusMessage }}"
             </p>
          </div>

          <div v-if="!isDealClosed" class="flex flex-col gap-6">
            <div class="space-y-3">
              <label class="text-[10px] text-slate-500 font-bold uppercase tracking-widest ml-1">Your Proposed Price</label>
              <div class="relative group">
                <span class="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-black text-emerald-500">$</span>
                <input 
                  type="number" 
                  step="0.01"
                  v-model="offerInput"
                  class="w-full bg-slate-950/80 border border-white/10 rounded-2xl py-6 pl-14 pr-8 text-3xl font-black text-white focus:outline-none focus:border-emerald-500/50 transition-all shadow-2xl"
                  @keyup.enter="submit"
                />
              </div>
              <div class="flex justify-between items-center px-2">
                <div class="flex items-center gap-2">
                  <div v-for="i in 3" :key="i" 
                    class="w-8 h-1.5 rounded-full transition-all duration-500"
                    :class="i <= (tradeStore.activeTrade?.attemptsLeft || 0) ? 'bg-emerald-500' : 'bg-slate-800'"
                  ></div>
                </div>
                <span class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  Attempts: {{ tradeStore.activeTrade?.attemptsLeft }} / 3
                </span>
              </div>
            </div>

            <div class="flex gap-4">
              <button 
                @click="reject"
                class="flex-1 py-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-rose-500/10 hover:border-rose-500/20 text-slate-400 hover:text-rose-500 font-black uppercase tracking-widest transition-all"
              >
                Decline Deal
              </button>
              <button 
                @click="submit"
                :disabled="tradeStore.activeTrade?.attemptsLeft === 0"
                class="flex-[2] py-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:grayscale"
              >
                Send Offer
              </button>
            </div>
          </div>

          <!-- Deal Result -->
          <div v-else class="mt-auto">
             <button 
                @click="close"
                class="w-full py-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest shadow-2xl transition-all"
             >
               Close Window
             </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.premium-modal-enter-active, .premium-modal-leave-active {
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.premium-modal-enter-from, .premium-modal-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(40px);
}

.perspective-1000 {
  perspective: 1000px;
}

.rotate-y-12 {
  transform: rotateY(12deg);
}

input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type=number] {
  -moz-appearance: textfield;
}

div {
  font-family: 'Inter', sans-serif;
}
</style>
