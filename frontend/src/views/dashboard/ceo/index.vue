<template>
  <div class="ceo-dashboard">
    <!-- Page Header -->
    <div class="page-header">
      <h1 class="page-title">CEO管理看板</h1>
      <p class="page-subtitle">高管视角综合数据分析</p>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-container" v-loading="loading" element-loading-text="加载中..."></div>

    <!-- Content -->
    <template v-if="!loading">
      <!-- Top Section: Executive Summary Cards -->
      <el-row :gutter="16" class="section-row">
        <el-col :span="6">
          <el-card shadow="never" class="stat-card">
            <div class="stat-label">本月回款</div>
            <div class="stat-value">{{ formatMoney(summary.monthRevenue) }}</div>
            <div class="stat-sub">目标 {{ formatMoney(summary.revenueTarget) }}</div>
            <el-progress
              :percentage="Math.round(summary.revenueRate * 100)"
              :color="summary.revenueRate > 0.8 ? '#67C23A' : summary.revenueRate > 0.6 ? '#E6A23C' : '#F56C6C'"
              :stroke-width="6"
              style="margin-top:8px"
            />
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="never" class="stat-card">
            <div class="stat-label">本月签单</div>
            <div class="stat-value">{{ summary.totalDeals }}单</div>
            <div class="stat-sub">最佳销售: {{ summary.topPerformer }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="never" class="stat-card">
            <div class="stat-label">平均成交周期</div>
            <div class="stat-value">{{ summary.avgDealCycle }}天</div>
            <div class="stat-sub">平均客单价 {{ formatMoney(summary.avgDealAmount) }}</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card shadow="never" class="stat-card">
            <div class="stat-label">团队规模</div>
            <div class="stat-value">{{ summary.teamSize }}人</div>
            <div class="stat-sub">活跃客户 {{ summary.activeCustomers }}个 ({{ summary.customerGrowth > 0 ? '+' : '' }}{{ Math.round(summary.customerGrowth * 100) }}%)</div>
          </el-card>
        </el-col>
      </el-row>

      <!-- Section 1: Core Issues -->
      <div class="section-card">
        <div class="section-title">🔍 五大核心问题分析</div>
        <el-table :data="coreIssues" border stripe style="width: 100%">
          <el-table-column prop="issue" label="问题" min-width="180" />
          <el-table-column prop="currentValue" label="当前值" width="120" align="center">
            <template #default="{ row }">
              <span class="value-cell">{{ formatNum(row.currentValue) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="baselineValue" label="基准值" width="120" align="center">
            <template #default="{ row }">
              <span>{{ formatNum(row.baselineValue) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="gap" label="差距" width="120" align="center">
            <template #default="{ row }">
              <span :class="gapClass(row.gap)">{{ row.gap > 0 ? '+' : '' }}{{ formatNum(row.gap) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="严重程度" width="120" align="center">
            <template #default="{ row }">
              <el-tag :type="severityTagType(row.severity)" size="small" effect="dark" class="severity-tag">
                {{ severityLabel(row.severity) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="suggestion" label="改进建议" min-width="200" />
        </el-table>
      </div>

      <!-- Section 2: Sales Team Comparison -->
      <div class="section-card">
        <div class="section-title">👥 销售团队7人全景对比</div>
        <div class="chart-section">
          <div class="chart-container">
            <VChart :option="chartOption" autoresize style="height: 400px; width: 100%" />
          </div>
          <div class="table-container">
            <el-table :data="salespersons" border stripe size="small" style="width: 100%">
              <el-table-column label="姓名" min-width="80">
                <template #default="{ row }">
                  <span>{{ row.name }}</span>
                  <el-tag v-if="row.name === summary.topPerformer" type="warning" size="small" effect="dark" class="top-badge">TOP1</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="deals" label="签单数" width="80" align="center" />
              <el-table-column prop="amount" label="成交金额(万)" min-width="120" align="center">
                <template #default="{ row }">
                  {{ formatMoney(row.amount) }}
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </div>
    </template>

    <!-- Empty State -->
    <el-empty v-if="!loading && noData" description="暂无数据" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VChart from 'vue-echarts'
import 'echarts'
import request from '@/api/request'

interface CoreIssue {
  issue: string
  currentValue: number
  baselineValue: number
  gap: number
  severity: string
  suggestion: string
}

interface Salesperson {
  name: string
  deals: number
  amount: number
  values: number[]
}

interface ExecutiveSummary {
  monthRevenue: number
  revenueTarget: number
  revenueRate: number
  totalDeals: number
  avgDealCycle: number
  avgDealAmount: number
  topPerformer: string
  teamSize: number
  activeCustomers: number
  customerGrowth: number
}

const loading = ref(true)
const noData = ref(false)

const coreIssues = ref<CoreIssue[]>([])
const salespersons = ref<Salesperson[]>([])
const dimensions = ref<string[]>([])
const summary = ref<ExecutiveSummary>({
  monthRevenue: 0,
  revenueTarget: 0,
  revenueRate: 0,
  totalDeals: 0,
  avgDealCycle: 0,
  avgDealAmount: 0,
  topPerformer: '',
  teamSize: 0,
  activeCustomers: 0,
  customerGrowth: 0,
})

const SALES_COLORS = [
  '#409EFF', '#67C23A', '#E6A23C', '#F56C6C',
  '#909399', '#9B59B6', '#1ABC9C',
]

function formatMoney(val: number): string {
  if (val >= 10000) {
    return '¥' + (val / 10000).toFixed(1) + '万'
  }
  return '¥' + val.toLocaleString()
}

function formatNum(val: number): string {
  return val.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function severityTagType(severity: string): string {
  const map: Record<string, string> = {
    critical: 'danger',
    warning: 'warning',
    info: 'info',
  }
  return map[severity] || 'info'
}

function severityLabel(severity: string): string {
  const map: Record<string, string> = {
    critical: '严重',
    warning: '警告',
    info: '一般',
  }
  return map[severity] || severity
}

function gapClass(gap: number): string {
  if (gap < 0) return 'gap-negative'
  if (gap > 0) return 'gap-positive'
  return ''
}

const chartOption = computed(() => {
  if (!dimensions.value.length || !salespersons.value.length) {
    return {}
  }

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#ebeef5',
      borderWidth: 1,
      textStyle: { color: '#303133' },
    },
    legend: {
      data: salespersons.value.map((s) => s.name),
      top: 0,
      textStyle: { color: '#606266', fontSize: 12 },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '14%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: dimensions.value,
      axisLine: { lineStyle: { color: '#dcdfe6' } },
      axisLabel: { color: '#909399', fontSize: 11 },
      axisTick: { alignWithLabel: true },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#f0f2f5' } },
      axisLabel: { color: '#909399' },
    },
    series: salespersons.value.map((sp, idx) => ({
      name: sp.name,
      type: 'bar',
      data: sp.values,
      barWidth: 10,
      barGap: '30%',
      itemStyle: {
        color: SALES_COLORS[idx % SALES_COLORS.length],
        borderRadius: [3, 3, 0, 0],
      },
      emphasis: {
        focus: 'series',
      },
    })),
  }
})

async function fetchData() {
  loading.value = true
  noData.value = false
  try {
    const res = await request.get('/dashboard/ceo')
    const data = res.data

    if (data) {
      coreIssues.value = data.coreIssues || []
      salespersons.value = data.salesComparison?.salespersons || []
      dimensions.value = data.salesComparison?.dimensions || []
      summary.value = {
        monthRevenue: data.executiveSummary?.monthRevenue ?? 0,
        revenueTarget: data.executiveSummary?.revenueTarget ?? 0,
        revenueRate: data.executiveSummary?.revenueRate ?? 0,
        totalDeals: data.executiveSummary?.totalDeals ?? 0,
        avgDealCycle: data.executiveSummary?.avgDealCycle ?? 0,
        avgDealAmount: data.executiveSummary?.avgDealAmount ?? 0,
        topPerformer: data.executiveSummary?.topPerformer ?? '',
        teamSize: data.executiveSummary?.teamSize ?? 0,
        activeCustomers: data.executiveSummary?.activeCustomers ?? 0,
        customerGrowth: data.executiveSummary?.customerGrowth ?? 0,
      }

      if (!coreIssues.value.length && !salespersons.value.length) {
        noData.value = true
      }
    } else {
      noData.value = true
    }
  } catch (err) {
    console.error('Failed to fetch CEO dashboard data:', err)
    noData.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.ceo-dashboard {
  padding: 0;
  background: #f0f2f5;
  min-height: 100%;
}

.page-header {
  margin-bottom: 20px;
}

.page-title {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 6px 0;
}

.page-subtitle {
  font-size: 14px;
  color: #909399;
  margin: 0;
}

.section-row {
  margin-bottom: 16px;
}

.stat-card {
  border-radius: 8px;
  background: #fff;
  padding: 8px 4px;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 6px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  line-height: 1.3;
}

.stat-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.section-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 16px;
}

.severity-tag {
  min-width: 48px;
}

.value-cell {
  font-weight: 500;
}

.gap-negative {
  color: #F56C6C;
  font-weight: 500;
}

.gap-positive {
  color: #67C23A;
  font-weight: 500;
}

.chart-section {
  display: flex;
  gap: 20px;
}

.chart-container {
  flex: 1;
  min-width: 0;
}

.table-container {
  width: 340px;
  flex-shrink: 0;
}

.top-badge {
  margin-left: 4px;
  vertical-align: middle;
}

.loading-container {
  height: 400px;
}

@media (max-width: 1200px) {
  .chart-section {
    flex-direction: column;
  }

  .table-container {
    width: 100%;
  }
}
</style>
