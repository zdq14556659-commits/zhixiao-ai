<template>
  <div class="chart-wrapper" v-loading="loading">
    <VChart v-if="!loading" :option="chartOption" autoresize style="height: 100%; width: 100%" />
    <el-empty v-else-if="!loading && !hasData" description="暂无数据" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import 'echarts'

interface DataItem {
  name: string
  value: number
}

interface Props {
  data: DataItem[]
  loading?: boolean
  barColor?: string
  showBackground?: boolean
  borderRadius?: number
}

const props = withDefaults(defineProps<Props>(), {
  data: () => [],
  loading: false,
  barColor: '#409EFF',
  showBackground: true,
  borderRadius: 4,
})

const hasData = computed(() => props.data.length > 0)

const chartOption = computed(() => ({
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: '#ebeef5',
    borderWidth: 1,
    textStyle: { color: '#303133' },
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    containLabel: true,
  },
  xAxis: {
    type: 'category',
    data: props.data.map((d) => d.name),
    axisLine: { lineStyle: { color: '#dcdfe6' } },
    axisLabel: { color: '#909399' },
  },
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: '#f0f2f5' } },
    axisLabel: { color: '#909399' },
  },
  series: [
    {
      data: props.data.map((d) => d.value),
      type: 'bar',
      barWidth: '40%',
      itemStyle: {
        color: props.barColor,
        borderRadius: [props.borderRadius, props.borderRadius, 0, 0],
      },
      backgroundStyle: props.showBackground
        ? { color: 'rgba(64, 158, 255, 0.05)', borderRadius: [props.borderRadius, props.borderRadius, 0, 0] }
        : undefined,
      showBackground: props.showBackground,
    },
  ],
}))
</script>

<style scoped>
.chart-wrapper {
  width: 100%;
  height: 100%;
  min-height: 300px;
}
</style>
