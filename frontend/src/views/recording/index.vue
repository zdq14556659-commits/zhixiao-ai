<template>
  <div class="recording-page">
    <!-- Upload Area -->
    <div class="upload-card">
      <el-upload
        ref="uploadRef"
        drag
        :action="uploadUrl"
        :headers="uploadHeaders"
        :on-success="handleUploadSuccess"
        :on-error="handleUploadError"
        :show-file-list="false"
        :data="uploadData"
        accept="audio/mp3,audio/wav,audio/m4a,audio/*"
      >
        <el-icon class="upload-icon" :size="40"><Upload /></el-icon>
        <div class="upload-text">
          <span>拖拽音频文件到此处，或 <em>点击上传</em></span>
        </div>
        <template #tip>
          <div class="upload-tip">支持 MP3、WAV、M4A 格式，单个文件不超过 100MB</div>
        </template>
      </el-upload>
    </div>

    <!-- Filter -->
    <div class="filter-card">
      <el-form :model="filterForm" inline>
        <el-form-item label="转写状态">
          <el-select v-model="filterForm.transcribeStatus" placeholder="全部" clearable style="width: 120px">
            <el-option label="待转写" value="pending" />
            <el-option label="转写中" value="processing" />
            <el-option label="已完成" value="completed" />
            <el-option label="失败" value="failed" />
          </el-select>
        </el-form-item>
        <el-form-item label="通话类型">
          <el-select v-model="filterForm.callType" placeholder="全部" clearable style="width: 120px">
            <el-option label="电话" value="phone" />
            <el-option label="微信语音" value="wechat" />
            <el-option label="面谈" value="meeting" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchData">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- Table -->
    <div class="table-card" v-loading="loading">
      <el-empty v-if="!loading && recordingList.length === 0" description="暂无录音记录，请上传音频文件" />
      <el-table v-else :data="recordingList" border stripe @row-click="handleRowClick" highlight-current-row>
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="fileName" label="文件名" min-width="200">
          <template #default="{ row }">
            <div class="file-name-cell">
              <el-icon :size="16"><Microphone /></el-icon>
              <span>{{ row.fileName }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="时长" width="80">
          <template #default="{ row }">{{ formatDuration(row.duration) }}</template>
        </el-table-column>
        <el-table-column prop="callType" label="类型" width="90" />
        <el-table-column label="主叫" width="120">
          <template #default="{ row }">{{ row.callerNumber || '-' }}</template>
        </el-table-column>
        <el-table-column label="被叫" width="120">
          <template #default="{ row }">{{ row.calleeNumber || '-' }}</template>
        </el-table-column>
        <el-table-column prop="transcribeStatus" label="转写状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.transcribeStatus)" size="small">{{ statusLabel(row.transcribeStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="analyzeStatus" label="分析状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.analyzeStatus" :type="statusTag(row.analyzeStatus)" size="small">{{ statusLabel(row.analyzeStatus) }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="上传时间" width="150" />
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.current"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchData"
          @current-change="fetchData"
        />
      </div>
    </div>

    <!-- Player Drawer -->
    <el-drawer v-model="playerVisible" title="录音详情" size="500px" :close-on-click-modal="false">
      <template v-if="currentRecording">
        <h3 class="player-title">{{ currentRecording.fileName }}</h3>
        <div class="empty-player-note">
          <el-alert title="音频播放需服务器端音频文件支持，当前为演示模式" type="info" :closable="false" show-icon />
        </div>
        <div class="player-info" style="margin-top:16px">
          <el-descriptions :column="2" size="small" border>
            <el-descriptions-item label="类型">{{ currentRecording.callType }}</el-descriptions-item>
            <el-descriptions-item label="时长">{{ formatDuration(currentRecording.duration) }}</el-descriptions-item>
            <el-descriptions-item label="主叫">{{ currentRecording.callerNumber || '-' }}</el-descriptions-item>
            <el-descriptions-item label="被叫">{{ currentRecording.calleeNumber || '-' }}</el-descriptions-item>
            <el-descriptions-item label="转写状态">
              <el-tag :type="statusTag(currentRecording.transcribeStatus)" size="small">{{ statusLabel(currentRecording.transcribeStatus) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="分析状态">
              <el-tag v-if="currentRecording.analyzeStatus" :type="statusTag(currentRecording.analyzeStatus)" size="small">{{ statusLabel(currentRecording.analyzeStatus) }}</el-tag>
              <span v-else>-</span>
            </el-descriptions-item>
          </el-descriptions>
        </div>
        <div v-if="currentRecording.transcribeText" class="transcript-preview">
          <h4>转写内容预览</h4>
          <pre class="transcript-text">{{ currentRecording.transcribeText }}</pre>
        </div>
      </template>
      <el-empty v-else description="请选择录音文件" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/api/request'
import dayjs from 'dayjs'

const loading = ref(false)
const recordingList = ref<any[]>([])
const playerVisible = ref(false)
const currentRecording = ref<any>(null)
const uploadRef = ref<any>(null)

const uploadUrl = '/api/recordings/upload'
const uploadHeaders = computed(() => ({
  Authorization: 'Bearer ' + (localStorage.getItem('token') || '')
}))
const uploadData = ref({})

const filterForm = reactive({
  transcribeStatus: '',
  callType: '',
})

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
})

function statusTag(s: string) {
  const map: Record<string, string> = { pending: 'info', processing: 'warning', completed: 'success', failed: 'danger' }
  return map[s] || 'info'
}
function statusLabel(s: string) {
  const map: Record<string, string> = { pending: '待转写', processing: '处理中', completed: '已完成', failed: '失败' }
  return map[s] || s
}
function formatDuration(sec: number) {
  if (!sec) return '-'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

async function fetchData() {
  loading.value = true
  try {
    const params: any = { page: pagination.current, size: pagination.pageSize }
    if (filterForm.transcribeStatus) params.transcribeStatus = filterForm.transcribeStatus
    if (filterForm.callType) params.callType = filterForm.callType
    const res = await request.get('/recordings', { params })
    recordingList.value = res.data.records || res.data || []
    pagination.total = res.data.total || (Array.isArray(res.data) ? res.data.length : 0)
  } catch (e: any) {
    recordingList.value = []
    pagination.total = 0
    if (e?.response?.status !== 401) {
      ElMessage.warning('加载录音列表失败')
    }
  }
  loading.value = false
}

function handleRowClick(row: any) {
  currentRecording.value = row
  playerVisible.value = true
}

function handleReset() {
  filterForm.transcribeStatus = ''
  filterForm.callType = ''
  fetchData()
}

function handleUploadSuccess(response: any) {
  if (response && response.code === 201) {
    ElMessage.success('上传成功，正在转写分析...')
    fetchData()
    // Refresh after 3s to show processing update
    setTimeout(fetchData, 3000)
    setTimeout(fetchData, 6000)
  } else {
    ElMessage.success('上传成功')
    fetchData()
  }
}

function handleUploadError(err: any) {
  ElMessage.error('上传失败: ' + (err?.message || '请重试'))
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.recording-page :deep(.el-upload-dragger) {
  padding: 30px;
}
.upload-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}
.upload-icon {
  margin-bottom: 8px;
}
.upload-text em {
  color: #409EFF;
  font-style: normal;
}
.upload-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
.filter-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}
.table-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
}
.file-name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pagination-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.player-title {
  font-size: 16px;
  color: #303133;
  margin: 0 0 16px;
}
.player-info {
  margin-top: 20px;
}
.empty-player-note {
  margin-bottom: 16px;
}
.transcript-preview {
  margin-top: 20px;
}
.transcript-preview h4 {
  margin-bottom: 8px;
  color: #303133;
}
.transcript-text {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  max-height: 300px;
  overflow-y: auto;
}
</style>
