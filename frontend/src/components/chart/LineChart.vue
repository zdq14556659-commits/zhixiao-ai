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
  smooth?: boolean
  areaStyle?: boolean
  showSymbol?: boolean
  lineColor?: string
}

const props = withDefaults(defineProps<Props>(), {
  data: () => [],
  loading: false,
  smooth: true,
  areaStyle: true,
  showSymbol: true,
  lineColor: '#409EFF',
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
      type: 'line',
      smooth: props.smooth,
      showSymbol: props.showSymbol,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: props.lineColor, width: 2 },
      itemStyle: { color: props.lineColor },
      areaStyle: props.areaStyle
        ? {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: props.lineColor + '40' },
                { offset: 1, color: props.lineColor + '05' },
              ],
            },
          }
        : undefined,
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
