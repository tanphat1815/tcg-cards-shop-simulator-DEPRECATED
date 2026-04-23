<script setup lang="ts">
/**
 * EndOfDayModal.vue
 * Component hiển thị bảng tổng kết sau khi kết thúc một ngày làm việc.
 */
import { useGameStore } from '../../shop-ui/store/gameStore'
import { useStatsStore } from '../store/statsStore'
import BaseModal from '../../shared/components/BaseModal.vue'
import EnhancedButton from '../../shared/components/EnhancedButton.vue'
import { formatUSD } from '../../shared/utils/currency'

const gameStore = useGameStore()
const statsStore = useStatsStore()
</script>

<template>
  <BaseModal
    :isOpen="statsStore.showEndDayModal"
    :title="`Tổng Kết Ngày ${statsStore.currentDay}`"
    size="md"
    :closeable="false"
    @close="gameStore.startNewDay()"
  >
    <template #default>
      <div class="text-center text-gray-400 mb-8 font-medium">Ca làm việc đã kết thúc!</div>

      <div class="space-y-4 mb-8">
        <div class="flex justify-between items-center bg-gray-900/50 p-4 rounded-xl border border-gray-700/50">
          <span class="text-gray-300 font-medium">Khách đã phục vụ</span>
          <span class="text-2xl font-bold text-blue-400">{{ statsStore.dailyStats.customersServed }}</span>
        </div>
        
        <div class="flex justify-between items-center bg-gray-900/50 p-4 rounded-xl border border-gray-700/50">
          <span class="text-gray-300 font-medium">Sản phẩm đã bán</span>
          <span class="text-2xl font-bold text-green-400">{{ statsStore.dailyStats.itemsSold }}</span>
        </div>

        <div class="flex justify-between items-center bg-gray-900/50 p-4 rounded-xl border border-gray-700/50">
          <span class="text-gray-300 font-medium">Doanh thu trong ngày</span>
          <span class="text-2xl font-black text-yellow-500">+{{ formatUSD(statsStore.dailyStats.revenue) }}</span>
        </div>
      </div>
    </template>

    <template #footer>
      <EnhancedButton
        variant="success"
        size="lg"
        fullWidth
        @click="gameStore.startNewDay()"
      >
        Bắt đầu ngày mới
      </EnhancedButton>
    </template>
  </BaseModal>
</template>
