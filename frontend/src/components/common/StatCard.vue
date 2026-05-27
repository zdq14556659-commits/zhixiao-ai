<template>
  <div class="stat-card" @click="$emit('click')">
    <div class="stat-card-icon" :style="{ background: iconBg }">
      <el-icon :size="24" :color="iconColor">
        <component :is="icon" />
      </el-icon>
    </div>
    <div class="stat-card-content">
      <div class="stat-card-value">{{ value }}</div>
      <div class="stat-card-label">{{ label }}</div>
      <div v-if="trend !== undefined" class="stat-card-trend" :class="{ up: trend > 0, down: trend < 0 }">
        <el-icon :size="12">
          <Top v-if="trend > 0" />
          <Bottom v-else />
        </el-icon>
        <span>{{ Math.abs(trend) }}%</span>
        <span class="trend-label">较上月</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

interface Props {
  icon: string | Component
  iconBg?: string
  iconColor?: string
  value: string | number
  label: string
  trend?: number
}

withDefaults(defineProps<Props>(), {
  iconBg: 'rgba(64, 158, 255, 0.1)',
  iconColor: '#409EFF',
})

defineEmits(['click'])
</script>

<style scoped>
.stat-card {
  display: flex;
  align-items: center;
  padding: 20px;
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
  transition: box-shadow 0.3s, transform 0.2s;
}

.stat-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.stat-card-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-card-content {
  margin-left: 16px;
  flex: 1;
}

.stat-card-value {
  font-size: 26px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.stat-card-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

.stat-card-trend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 12px;
}

.stat-card-trend.up {
  color: #67c23a;
}

.stat-card-trend.down {
  color: #f56c6c;
}

.trend-label {
  color: #909399;
}
</style>
