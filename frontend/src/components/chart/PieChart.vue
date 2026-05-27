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
  showLegend?: boolean
  roseType?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  data: () => [],
  loading: false,
  showLegend: true,
  roseType: false,
})

const colors = ['#409EFF', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#b37feb', '#36cfc9']
const hasData = computed(() => props.data.length > 0)

const chartOption = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: '{b}: {c} ({d}%)',
  },
  legend: props.showLegend
    ? {
        orient: 'vertical',
        right: '5%',
        top: 'center',
        textStyle: { color: '#606266' },
        itemWidth: 10,
        itemHeight: 10,
      }
    : undefined,
  series: [
    {
      type: 'pie',
      radius: props.roseType ? ['20%', '60%'] : '50%',
      center: ['40%', '50%'],
      roseType: props.roseType ? 'radius' : undefined,
      data: props.data.map((d, i) => ({
        ...d,
        itemStyle: { color: colors[i % colors.length] },
      })),
      label: {
        color: '#606266',
        formatter: '{b}: {d}%',
      },
      labelLine: {
        lineStyle: { color: '#dcdfe6' },
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.15)',
        },
      },
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
