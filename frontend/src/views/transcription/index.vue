<template>
  <div class="transcription-page">
    <el-row :gutter="16" style="height: 100%">
      <!-- Left: Recording List -->
      <el-col :span="10" style="height: 100%">
        <div class="panel-card" style="height: 100%">
          <div class="panel-header">
            <h3>录音列表</h3>
            <el-input
              v-model="searchKeyword"
              placeholder="搜索文件名..."
              prefix-icon="Search"
              clearable
              size="small"
              style="width: 200px"
            />
          </div>
          <div class="recording-list" v-loading="listLoading">
            <div
              v-for="item in filteredRecordings"
              :key="item.id"
              class="recording-item"
              :class="{ active: currentId === item.id }"
              @click="selectRecording(item)"
            >
              <div class="recording-item-icon">
                <el-icon :size="20" color="#409EFF"><Microphone /></el-icon>
              </div>
              <div class="recording-item-info">
                <div class="recording-item-name">{{ item.fileName }}</div>
                <div class="recording-item-meta">
                  <span>{{ item.duration }}</span>
                  <span>{{ item.createdAt }}</span>
                </div>
              </div>
              <el-tag :type="analyzeTagType(item.analyzeStatus)" size="small" v-if="item.analyzeStatus">
                {{ item.analyzeStatus }}
              </el-tag>
            </div>
            <el-empty v-if="!filteredRecordings.length" description="暂无已完成转写的录音" />
          </div>
        </div>
      </el-col>

      <!-- Right: Transcript & Analysis -->
      <el-col :span="14" style="height: 100%">
        <div v-if="currentRecording" style="height: 100%; display: flex; flex-direction: column; gap: 16px;">
          <!-- Audio Player -->
          <div class="panel-card">
            <AudioPlayer :src="currentRecording.audioUrl || ''" />
          </div>

          <!-- Transcript -->
          <div class="panel-card flex-1">
            <div class="panel-header">
              <h3>转写文本</h3>
              <el-button size="small" type="primary" @click="handleAnalyze" v-if="currentRecording.analyzeStatus === '待分析'">
                <el-icon><DataAnalysis /></el-icon>
                AI分析
              </el-button>
            </div>
            <div class="transcript-body" v-loading="transcriptLoading">
              <div v-for="(seg, i) in transcript" :key="i" class="transcript-segment">
                <span class="speaker-label" :class="seg.speaker === 'agent' ? 'agent' : 'customer'">
                  {{ seg.speaker === 'agent' ? '坐席' : '客户' }}
                </span>
                <span class="transcript-text">{{ seg.text }}</span>
                <span class="transcript-time">{{ seg.time }}</span>
              </div>
              <el-empty v-if="!transcript.length" :image-size="60" description="暂无转写内容" />
            </div>
          </div>

          <!-- Analysis Result -->
          <div v-if="analysisResult" class="panel-card">
            <div class="panel-header">
              <h3>分析结果</h3>
            </div>
            <el-row :gutter="16">
              <el-col :span="6">
                <div class="analysis-stat">
                  <span class="stat-label">客户意向</span>
                  <span class="stat-value" :style="{ color: intentionColor(analysisResult.intention) }">{{ analysisResult.intention }}</span>
                </div>
              </el-col>
              <el-col :span="6">
                <div class="analysis-stat">
                  <span class="stat-label">情绪评分</span>
                  <span class="stat-value" :style="{ color: emotionColor(analysisResult.emotionScore) }">{{ analysisResult.emotionScore }}分</span>
                </div>
              </el-col>
              <el-col :span="6">
                <div class="analysis-stat">
                  <span class="stat-label">沟通评分</span>
                  <span class="stat-value" style="color:#409EFF">{{ analysisResult.communicationScore }}分</span>
                </div>
              </el-col>
              <el-col :span="6">
                <div class="analysis-stat">
                  <span class="stat-label">关键词</span>
                  <span class="stat-value" style="font-size:12px">{{ analysisResult.keywords?.join(', ') }}</span>
                </div>
              </el-col>
            </el-row>
            <div class="analysis-summary">
              <strong>总结：</strong>{{ analysisResult.summary }}
            </div>
          </div>
        </div>

        <div v-else class="panel-card empty-panel">
          <el-empty description="请从左侧选择录音查看转写" />
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import AudioPlayer from '@/components/common/AudioPlayer.vue'

const listLoading = ref(false)
const transcriptLoading = ref(false)
const searchKeyword = ref('')
const currentId = ref<number | null>(null)
const currentRecording = ref<any>(null)
const transcript = ref<any[]>([])
const analysisResult = ref<any>(null)

const recordings = ref<any[]>([])

const filteredRecordings = computed(() => {
  if (!searchKeyword.value) return recordings.value
  return recordings.value.filter((r) => r.fileName.toLowerCase().includes(searchKeyword.value.toLowerCase()))
})

function analyzeTagType(status: string) {
  const map: Record<string, string> = {
    待分析: 'info',
    分析中: 'warning',
    已完成: 'success',
    失败: 'danger',
  }
  return map[status] || 'info'
}

function intentionColor(intention: string) {
  const map: Record<string, string> = {
    高: '#67c23a',
    中: '#e6a23c',
    低: '#f56c6c',
  }
  return map[intention] || '#909399'
}

function emotionColor(score: number) {
  if (score >= 80) return '#67c23a'
  if (score >= 60) return '#e6a23c'
  return '#f56c6c'
}

function fetchRecordings() {
  listLoading.value = true
  setTimeout(() => {
    recordings.value = []
    for (let i = 0; i < 20; i++) {
      recordings.value.push({
        id: i + 1,
        fileName: `录音_${dayjs().subtract(i, 'day').format('YYYYMMDD')}_${String(i + 1).padStart(3, '0')}.mp3`,
        duration: `${String(Math.floor(Math.random() * 10) + 1).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
        createdAt: dayjs().subtract(i, 'day').format('YYYY-MM-DD HH:mm'),
        transcribeStatus: '已完成',
        analyzeStatus: i < 10 ? '已完成' : '待分析',
        audioUrl: '',
      })
    }
    listLoading.value = false
  }, 300)
}

function selectRecording(item: any) {
  currentId.value = item.id
  currentRecording.value = item
  transcriptLoading.value = true
  analysisResult.value = null

  setTimeout(() => {
    // Mock transcript
    const speakers = ['agent', 'customer']
    transcript.value = []
    for (let i = 0; i < 8; i++) {
      transcript.value.push({
        speaker: speakers[i % 2],
        text: i % 2 === 0
          ? `您好，这里是智销AI客服中心，请问有什么可以帮助您的？`
          : `你好，我想咨询一下你们的产品功能和报价情况。我最近在对比几家供应商。`,
        time: `00:${String(Math.floor(i * 12)).padStart(2, '0')}`,
      })
    }

    if (item.analyzeStatus === '已完成') {
      analysisResult.value = {
        intention: '中',
        emotionScore: 72,
        communicationScore: 68,
        keywords: ['产品咨询', '报价', '对比供应商'],
        summary: '客户主动咨询产品功能及报价，处于选型对比阶段，意向中等。建议尽快发送详细资料并安排产品演示跟进。',
      }
    }

    transcriptLoading.value = false
  }, 400)
}

function handleAnalyze() {
  ElMessage.info('正在启动AI分析...')
  setTimeout(() => {
    analysisResult.value = {
      intention: '中',
      emotionScore: 72,
      communicationScore: 68,
      keywords: ['产品咨询', '报价', '对比供应商'],
      summary: '客户主动咨询产品功能及报价，处于选型对比阶段，意向中等。建议尽快发送详细资料并安排产品演示跟进。',
    }
    ElMessage.success('分析完成')
  }, 1500)
}

onMounted(() => {
  fetchRecordings()
})
</script>

<style scoped>
.transcription-page {
  height: calc(100vh - 140px);
  overflow: hidden;
}

.panel-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.panel-card.flex-1 {
  flex: 1;
  overflow: hidden;
}

.panel-card.empty-panel {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.recording-list {
  flex: 1;
  overflow-y: auto;
}

.recording-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
  margin-bottom: 4px;
}

.recording-item:hover {
  background: #f5f7fa;
}

.recording-item.active {
  background: rgba(64, 158, 255, 0.08);
  border: 1px solid rgba(64, 158, 255, 0.2);
}

.recording-item-icon {
  flex-shrink: 0;
}

.recording-item-info {
  flex: 1;
  min-width: 0;
}

.recording-item-name {
  font-size: 13px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recording-item-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

.transcript-body {
  flex: 1;
  overflow-y: auto;
}

.transcript-segment {
  display: flex;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f5f7fa;
}

.transcript-segment:last-child {
  border-bottom: none;
}

.speaker-label {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  height: fit-content;
}

.speaker-label.agent {
  background: rgba(64, 158, 255, 0.1);
  color: #409EFF;
}

.speaker-label.customer {
  background: rgba(103, 194, 58, 0.1);
  color: #67c23a;
}

.transcript-text {
  flex: 1;
  font-size: 13px;
  color: #303133;
  line-height: 1.6;
}

.transcript-time {
  flex-shrink: 0;
  font-size: 11px;
  color: #c0c4cc;
  white-space: nowrap;
}

.analysis-stat {
  text-align: center;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 6px;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
}

.analysis-summary {
  margin-top: 12px;
  padding: 12px;
  background: #fef7e0;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
}
</style>
