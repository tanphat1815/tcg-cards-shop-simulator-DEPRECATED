<script setup lang="ts">
import { ref } from 'vue'
import { getPackVisuals, getBoxVisuals } from '../../features/inventory/config/assetRegistry'

const props = defineProps<{
  itemId: string
  type: 'pack' | 'box'
  sourceSetId?: string
  alt?: string
}>()

const hasError = ref(false)

function getUrl() {
  const setId = props.sourceSetId || props.itemId
  return props.type === 'pack' 
    ? getPackVisuals(setId).front 
    : getBoxVisuals(setId).front
}

function handleError() {
  hasError.value = true
}
</script>

<template>
  <div class="product-image-container flex items-center justify-center w-full h-full">
    <img 
      v-if="!hasError"
      :src="getUrl()"
      :alt="alt || itemId"
      class="max-h-full max-w-full object-contain pointer-events-none drop-shadow-md"
      @error="handleError"
    />
    
    <!-- Universal Fallback if no image -->
    <div v-else class="product-fallback flex flex-col items-center justify-center select-none text-center">
      <div class="text-4xl filter drop-shadow-sm">{{ type === 'box' ? '📦' : '🎁' }}</div>
    </div>
  </div>
</template>

<style scoped>
.product-image-container {
  overflow: hidden;
}
</style>
