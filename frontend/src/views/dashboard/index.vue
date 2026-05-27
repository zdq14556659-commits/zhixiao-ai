<template>
  <div class="dashboard-page">
    <!-- Summary Cards -->
    <el-row :gutter="16" class="card-row">
      <el-col :span="6" v-for="stat in summaryCards" :key="stat.label">
        <StatCard
          :icon="stat.icon"
          :value="stat.value"
          :label="stat.label"
          :trend="stat.trend"
          :icon-bg="stat.iconBg"
          :icon-color="stat.iconColor"
        />
      </el-col>
    </el-row>

    <!-- Charts Row -->
    <el-row :gutter="16" class="chart-row">
      <el-col :span="12">
        <div class="chart-card">
          <div class="chart-card-header">
            <span class="chart-title">近7日新增客户趋势</span>
          </div>
          <div class="chart-body">
            <LineChart :data="newCustomerTrend" />
          </div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="chart-card">
          <div class="chart-card-header">
            <span class="chart-title">销售漏斗各阶段转化</span>
          </div>
          <div class="chart-body">
            <BarChart :data="funnelData" bar-color="#e6a23c" />
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="chart-row">
      <el-col :span="8">
        <div class="chart-card">
          <div class="chart-card-header">
            <span class="chart-title">客户来源分布</span>
          </div>
          <div class="chart-body">
            <PieChart :data="sourceDistribution" />
          </div>
        </div>
      </el-col>
      <el-col :span="16">
        <div class="chart-card">
          <div class="chart-card-header">
            <span class="chart-title">近期待跟进客户</span>
          </div>
          <div class="chart-body">
            <el-table :data="pendingFollowups" border stripe size="small" style="width: 100%">
              <el-table-column prop="name" label="客户名称" min-width="120" />
              <el-table-column prop="phone" label="电话" min-width="120" />
              <el-table-column prop="stage" label="阶段" min-width="100">
                <template #default="{ row }">
                  <el-tag :type="stageTagType(row.stage)" size="small">{{ row.stage }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="nextContactTime" label="下次联系时间" min-width="140" />
              <el-table-column prop="owner" label="负责人" min-width="80" />
            </el-table>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import dayjs from 'dayjs'
import LineChart from '@/components/chart/LineChart.vue'
import BarChart from '@/components/chart/BarChart.vue'
import PieChart from '@/components/chart/PieChart.vue'

const summaryCards = ref([
  { icon: 'User', value: '1,286', label: '总客户数', trend: 12, iconBg: 'rgba(64, 158, 255, 0.1)', iconColor: '#409EFF' },
  { icon: 'TrendCharts', value: '86', label: '跟进中商机', trend: 8, iconBg: 'rgba(103, 194, 58, 0.1)', iconColor: '#67c23a' },
  { icon: 'Money', value: '¥3,680,000', label: '本月成交', trend: -3, iconBg: 'rgba(230, 162, 60, 0.1)', iconColor: '#e6a23c' },
  { icon: 'List', value: '24', label: '今日任务', trend: 0, iconBg: 'rgba(245, 108, 108, 0.1)', iconColor: '#f56c6c' },
])

const newCustomerTrend = ref<{ name: string; value: number }[]>([])
const funnelData = ref<{ name: string; value: number }[]>([])
const sourceDistribution = ref<{ name: string; value: number }[]>([])

const pendingFollowups = ref([
  { name: '深圳科技有限公司', phone: '138****5678', stage: '意向客户', nextContactTime: dayjs().add(1, 'day').format('YYYY-MM-DD HH:mm'), owner: '张三' },
  { name: '北京创新互联网', phone: '139****9012', stage: '初步沟通', nextContactTime: dayjs().add(2, 'day').format('YYYY-MM-DD HH:mm'), owner: '李四' },
  { name: '上海智能数据', phone: '136****3456', stage: '方案演示', nextContactTime: dayjs().add(1, 'day').format('YYYY-MM-DD HH:mm'), owner: '王五' },
  { name: '广州数码科技', phone: '135****7890', stage: '签约', nextContactTime: dayjs().add(3, 'day').format('YYYY-MM-DD HH:mm'), owner: '张三' },
  { name: '杭州云计算公司', phone: '137****2345', stage: '意向客户', nextContactTime: dayjs().add(1, 'day').format('YYYY-MM-DD HH:mm'), owner: '李四' },
  { name: '成都创新软件', phone: '158****6789', stage: '报价', nextContactTime: dayjs().add(2, 'day').format('YYYY-MM-DD HH:mm'), owner: '赵六' },
])

function stageTagType(stage: string) {
  const map: Record<string, string> = {
    '初步沟通': 'info',
    '意向客户': 'primary',
    '方案演示': 'warning',
    '报价': 'danger',
    '签约': 'success',
  }
  return map[stage] || 'info'
}

onMounted(() => {
  // Generate mock trend data for last 7 days
  const trend: { name: string; value: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const date = dayjs().subtract(i, 'day')
    trend.push({
      name: date.format('MM-DD'),
      value: Math.floor(Math.random() * 15) + 3,
    })
  }
  newCustomerTrend.value = trend

  // Funnel data
  funnelData.value = [
    { name: '线索', value: 520 },
    { name: '初步沟通', value: 380 },
    { name: '意向客户', value: 220 },
    { name: '方案演示', value: 150 },
    { name: '报价', value: 90 },
    { name: '签约', value: 45 },
  ]

  // Source distribution
  sourceDistribution.value = [
    { name: '线上推广', value: 35 },
    { name: '电话营销', value: 25 },
    { name: '客户推荐', value: 18 },
    { name: '线下活动', value: 12 },
    { name: '其他', value: 10 },
  ]
})
</script>

<style scoped>
.dashboard-page {
  padding: 0;
}

.card-row {
  margin-bottom: 16px;
}

.chart-row {
  margin-bottom: 16px;
}

.chart-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
}

.chart-card-header {
  margin-bottom: 16px;
}

.chart-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.chart-body {
  height: 320px;
}
</style>
