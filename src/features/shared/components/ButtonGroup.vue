<template>
  <div class="inline-flex rounded-xl shadow-lg border border-gray-700/50 overflow-hidden" :class="groupClasses">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
export type ButtonGroupVariant = 'default' | 'outline' | 'ghost'
export type ButtonGroupSize = 'sm' | 'md' | 'lg'

interface Props {
  variant?: ButtonGroupVariant
  size?: ButtonGroupSize
  fullWidth?: boolean
  vertical?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md',
  fullWidth: false,
  vertical: false
})

const groupClasses = computed(() => {
  const classes = []

  if (props.fullWidth) classes.push('w-full')
  if (props.vertical) classes.push('flex-col')

  return classes.join(' ')
})
</script>

<style scoped>
/* Button group styles */
:deep(.btn-group-item) {
  border: 0;
  border-right: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 0;
}

:deep(.btn-group-item:last-child) {
  border-right: 0;
}

:deep(.btn-group-item:first-child) {
  border-radius: 0.75rem 0 0 0.75rem;
}

:deep(.btn-group-item:last-child) {
  border-radius: 0 0.75rem 0.75rem 0;
  border-right: 0;
}

:deep(.btn-group-item:only-child) {
  border-radius: 0.75rem;
}

/* Vertical group support */
.flex-col :deep(.btn-group-item) {
  border-right: 0;
  border-bottom: 1px solid rgba(55, 65, 81, 0.5);
}

.flex-col :deep(.btn-group-item:first-child) {
  border-radius: 0.75rem 0.75rem 0 0;
}

.flex-col :deep(.btn-group-item:last-child) {
  border-radius: 0 0 0.75rem 0.75rem;
  border-bottom: 0;
}

.flex-col :deep(.btn-group-item:only-child) {
  border-radius: 0.75rem;
}
</style>