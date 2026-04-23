<script setup lang="ts">
/**
 * POKEMON CARD 3D COMPONENT (SIMEYDOTME COMPLIANT)
 * - Đảm bảo cấu trúc DOM 100% chuẩn thư viện.
 * - Sử dụng CSS variables để điều khiển hiệu ứng.
 */
import { ref, computed } from 'vue';
import { mapRarityToCSS, getFoilMaskURL } from '../utils/cardRarityMapper';

interface Props {
  card: any;
  isBack?: boolean;
  width?: string | number;
  disableTilt?: boolean;
  isHit?: boolean;
  isReverse?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  width: '320px',
  disableTilt: false,
  isHit: false,
  isReverse: false,
});

const emit = defineEmits<{
  (e: 'click', card: any): void
  (e: 'contextmenu', card: any): void
}>();

const cardElement = ref<HTMLElement | null>(null);
const isLoaded = ref(false);
const isInteracting = ref(false);

const rarityClass = computed(() => mapRarityToCSS(
  props.card?.rarity, 
  props.card?.subtypes, 
  props.card?.name,
  props.card?.number,
  props.card?.set?.id || props.card?.set_id || props.card?.set
));

const holoStyles = computed(() => {
  if (props.isBack) return {};
  
  const maskUrl = getFoilMaskURL(props.card, rarityClass.value, 'masks');
  const foilUrl = getFoilMaskURL(props.card, rarityClass.value, 'foils');
  
  return {
    '--mask': `url(${maskUrl})`,
    '--foil': `url(${foilUrl})`,
    '--seedx': Math.random(),
    '--seedy': Math.random(),
    '--cosmosbg': `${Math.floor(Math.random() * 1000)}px ${Math.floor(Math.random() * 1000)}px`,
    '--debug-url': maskUrl
  };
});

const typeClass = computed(() => {
  if (!props.card?.types) return '';
  return Array.isArray(props.card.types) 
    ? props.card.types.map((t: string) => t.toLowerCase()).join(' ') 
    : props.card.types.toLowerCase();
});
const imageSrc = computed(() => props.card?.image ? `${props.card.image}/high.webp` : '');

const handleMouseMove = (e: MouseEvent) => {
  if (props.disableTilt || !cardElement.value) return;
  isInteracting.value = true;

  const rect = cardElement.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const px = Math.max(Math.min((100 / rect.width) * x, 100), 0);
  const py = Math.max(Math.min((100 / rect.height) * y, 100), 0);

  const pl = px / 100;
  const pt = py / 100;
  const p_xc = Math.abs(px - 50);
  const p_yc = Math.abs(py - 50);
  const pc = Math.sqrt(Math.pow(p_xc, 2) + Math.pow(p_yc, 2)) / 50;

  const rx = (px - 50) * -0.3;
  const ry = (py - 50) * 0.3;

  const st = cardElement.value.style;
  st.setProperty('--pointer-x', `${px}%`);
  st.setProperty('--pointer-y', `${py}%`);
  st.setProperty('--pointer-from-left', `${pl}`);
  st.setProperty('--pointer-from-top', `${pt}`);
  st.setProperty('--pointer-from-center', `${pc}`);
  st.setProperty('--rotate-x', `${rx}deg`);
  st.setProperty('--rotate-y', `${ry}deg`);
  st.setProperty('--background-x', `${px}%`);
  st.setProperty('--background-y', `${py}%`);
};

const handleMouseLeave = () => {
  isInteracting.value = false;
  if (!cardElement.value) return;
  const st = cardElement.value.style;
  st.setProperty('--pointer-x', '50%');
  st.setProperty('--pointer-y', '50%');
  st.setProperty('--rotate-x', '0deg');
  st.setProperty('--rotate-y', '0deg');
  st.setProperty('--pointer-from-center', '0');
};

function onImgLoad() { isLoaded.value = true; }
function handleClick() { emit('click', props.card); }
function handleContextMenu(e: MouseEvent) {
  e.preventDefault();
  emit('contextmenu', props.card);
}
</script>

<template>
  <div
    ref="cardElement"
    class="card interactive masked"
    :class="[
      rarityClass,
      typeClass,
      { 'is-back': isBack },
      { 'is-hit': isHit },
      { 'no-tilt': disableTilt },
      { 'active': isInteracting },
      { 'interacting': isInteracting },
      { 'masked': true }
    ]"
    :data-rarity="props.isReverse ? rarityClass + ' reverse holo' : rarityClass"
    :data-subtypes="Array.isArray(props.card?.subtypes) ? props.card.subtypes.join(' ').toLowerCase() : (props.card?.subtypes || '').toLowerCase()"
    :data-supertype="(props.card?.supertype || '').toLowerCase()"
    :data-number="String(props.card?.number || '').toLowerCase()"
    :data-set="String(props.card?.set?.id || props.card?.set_id || props.card?.set || '').toLowerCase().replace(/(tg|gg|sv)/g, '')"
    :data-debug-holo="holoStyles['--mask']"
    :style="{ 
      width: typeof props.width === 'number' ? props.width + 'px' : props.width,
      '--card-opacity': props.isBack || props.disableTilt ? 0 : 1
    }"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
    @click="handleClick"
    @contextmenu="handleContextMenu"
  >
    <div class="card__translater">
      <div class="card__rotator">
        <div class="card__front" :style="holoStyles">
          <img :src="imageSrc" @load="onImgLoad" alt="Card Front" loading="lazy" />
          <!-- Shine & Glare: BẮT BUỘC có trong DOM để thư viện hoạt động -->
          <div class="card__shine"></div>
          <div class="card__glare"></div>
          
          <div v-if="props.isHit" class="card__hit-overlay"></div>
          <div v-if="!isLoaded" class="card__loading"><div class="spinner"></div></div>
        </div>
        <div class="card__back">
          <img src="/assets/cards/back.webp" alt="Card Back" loading="lazy" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  --card-scale: 1;
  --rotate-x: 0deg;
  --rotate-y: 0deg;
  --pointer-x: 50%;
  --pointer-y: 50%;
  --pointer-from-center: 0;
  --card-opacity: 1;
  --translate-x: 0px;
  --translate-y: 0px;

  max-width: 100%;
  aspect-ratio: 0.714;
  position: relative;
  user-select: none;
  cursor: pointer;
  transform-style: preserve-3d;
}

.card.active, .card.active * {
  transition: none !important;
}

/* Card Rotator: Xử lý lật mặt cơ bản bằng transition */
.card__rotator {
  transition: transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  transform-style: preserve-3d;
}

.card.is-back .card__rotator {
  transform: rotateY(180deg) !important;
}

/* Ẩn mặt phía sau khi lật */
.card__front, .card__back {
  backface-visibility: hidden;
  position: absolute;
  inset: 0;
}

.card__front {
  transform: rotateY(0deg);
  z-index: 2;
}

.card__back {
  transform: rotateY(180deg);
  z-index: 1;
}

/* Hỗ trợ tắt Tilt */
.card.no-tilt .card__shine,
.card.no-tilt .card__glare {
  display: none;
}

.card.no-tilt .card__rotator {
  transform: none !important;
  transition: none;
}

/* Remove explicit mask none to allow library masks */

/* Hit overlay */
.card__hit-overlay {
  position: absolute;
  inset: 0;
  background: rgba(239, 68, 68, 0.45);
  z-index: 20;
  animation: hit-flash 0.4s ease forwards;
}

@keyframes hit-flash { 0% { opacity: 1; } 100% { opacity: 0; } }

.card__loading {
  position: absolute;
  inset: 0;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.spinner {
  width: 40px; height: 40px;
  border: 4px solid rgba(255,255,255,0.1);
  border-left-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.card__front img, .card__back img {
  width: 100%; height: 100%;
  object-fit: cover; display: block;
}
</style>
