<template>
  <div class="ai-dashboard-page">
    <!-- Stats Cards -->
    <el-row :gutter="16" class="card-row">
      <el-col :span="8">
        <div class="ai-stat-card">
          <div class="ai-stat-icon" style="background: rgba(64, 158, 255, 0.1)">
            <el-icon :size="28" color="#409EFF"><Microphone /></el-icon>
          </div>
          <div class="ai-stat-content">
            <div class="ai-stat-value">{{ stats.totalRecordings }}</div>
            <div class="ai-stat-label">已分析录音总数</div>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="ai-stat-card">
          <div class="ai-stat-icon" style="background: rgba(103, 194, 58, 0.1)">
            <el-icon :size="28" color="#67c23a"><Smile /></el-icon>
          </div>
          <div class="ai-stat-content">
            <div class="ai-stat-value">{{ stats.avgEmotionScore }}分</div>
            <div class="ai-stat-label">平均情绪评分</div>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="ai-stat-card">
          <div class="ai-stat-icon" style="background: rgba(230, 162, 60, 0.1)">
            <el-icon :size="28" color="#e6a23c"><DataBoard /></el-icon>
          </div>
          <div class="ai-stat-content">
            <div class="ai-stat-value">{{ stats.positiveRate }}%</div>
            <div class="ai-stat-label">正向沟通占比</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- Charts Row -->
    <el-row :gutter="16" class="chart-row">
      <el-col :span="8">
        <div class="chart-card">
          <div class="chart-card-header">意图分布</div>
          <div class="chart-body">
            <PieChart :data="intentionData" :loading="loading" />
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="chart-card">
          <div class="chart-card-header">近7日情绪趋势</div>
          <div class="chart-body">
            <LineChart :data="emotionTrend" :loading="loading" line-color="#67c23a" />
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="chart-card">
          <div class="chart-card-header">评分分布</div>
          <div class="chart-body">
            <BarChart :data="scoreDistribution" :loading="loading" bar-color="#b37feb" />
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- Recent Analysis List -->
    <div class="table-card">
      <div class="table-card-header">最新分析记录</div>
      <el-table :data="recentAnalysis" border stripe size="small">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="fileName" label="录音文件" min-width="160" />
        <el-table-column prop="intention" label="客户意向" width="80">
          <template #default="{ row }">
            <el-tag :type="intentionTagType(row.intention)" size="small">{{ row.intention }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="emotionScore" label="情绪评分" width="90">
          <template #default="{ row }">
            <span :style="{ color: emotionColor(row.emotionScore), fontWeight: 600 }">{{ row.emotionScore }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="communicationScore" label="沟通评分" width="90">
          <template #default="{ row }">
            <span :style="{ color: emotionColor(row.communicationScore), fontWeight: 600 }">{{ row.communicationScore }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="keywords" label="关键词" min-width="150">
          <template #default="{ row }">
            <el-tag v-for="kw in row.keywords" :key="kw" size="small" style="margin-right: 4px; margin-bottom: 2px">{{ kw }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="analyzedAt" label="分析时间" width="150" />
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import dayjs from 'dayjs'
import PieChart from '@/components/chart/PieChart.vue'
import LineChart from '@/components/chart/LineChart.vue'
import BarChart from '@/components/chart/BarChart.vue'

const loading = ref(false)

const stats = ref({
  totalRecordings: 286,
  avgEmotionScore: 73,
  positiveRate: 65,
})

const intentionData = ref<{ name: string; value: number }[]>([])
const emotionTrend = ref<{ name: string; value: number }[]>([])
const scoreDistribution = ref<{ name: string; value: number }[]>([])
const recentAnalysis = ref<any[]>([])

function intentionTagType(intention: string) {
  const map: Record<string, string> = {
    高: 'success',
    中: 'warning',
    低: 'danger',
  }
  return map[intention] || 'info'
}

function emotionColor(score: number) {
  if (score >= 80) return '#67c23a'
  if (score >= 60) return '#e6a23c'
  return '#f56c6c'
}

onMounted(() => {
  loading.value = true

  setTimeout(() => {
    intentionData.value = [
      { name: '产品咨询', value: 85 },
      { name: '售后问题', value: 52 },
      { name: '投诉建议', value: 28 },
      { name: '合作洽谈', value: 45 },
      { name: '纯粹推销', value: 38 },
      { name: '其他', value: 22 },
    ]

    const trend: { name: string; value: number }[] = []
    for (let i = 6; i >= 0; i--) {
      trend.push({
        name: dayjs().subtract(i, 'day').format('MM-DD'),
        value: Math.floor(Math.random() * 20) + 60,
      })
    }
    emotionTrend.value = trend

    scoreDistribution.value = [
      { name: '90-100分', value: 15 },
      { name: '80-89分', value: 35 },
      { name: '70-79分', value: 48 },
      { name: '60-69分', value: 32 },
      { name: '60分以下', value: 18 },
    ]

    const list = []
    for (let i = 0; i < 10; i++) {
      list.push({
        id: i + 1,
        fileName: `录音_${dayjs().subtract(i, 'day').format('YYYYMMDD')}_${String(i + 1).padStart(3, '0')}.mp3`,
        intention: ['高', '中', '低'][i % 3],
        emotionScore: Math.floor(Math.random() * 40) + 50,
        communicationScore: Math.floor(Math.random() * 30) + 60,
        keywords: ['产品', '报价', '服务', '功能', '价格'].slice(0, (i % 4) + 1),
        analyzedAt: dayjs().subtract(i, 'hour').format('YYYY-MM-DD HH:mm'),
      })
    }
    recentAnalysis.value = list

    loading.value = false
  }, 300)
})
</script>

<style scoped>
.card-row {
  margin-bottom: 16px;
}

.chart-row {
  margin-bottom: 16px;
}

.ai-stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 20px;
}

.ai-stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #303133;
}

.ai-stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

.chart-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
}

.chart-card-header {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 16px;
}

.chart-body {
  height: 300px;
}

.table-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
}

.table-card-header {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 16px;
}
</style>
