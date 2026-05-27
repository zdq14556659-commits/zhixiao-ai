<template>
  <div class="opportunity-page">
    <!-- Actions -->
    <div class="action-bar">
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        新建商机
      </el-button>
      <el-radio-group v-model="viewMode" size="small" style="margin-left: 16px">
        <el-radio-button value="kanban">看板</el-radio-button>
        <el-radio-button value="list">列表</el-radio-button>
      </el-radio-group>
    </div>

    <!-- Kanban View -->
    <div v-if="viewMode === 'kanban'" class="kanban-board" v-loading="loading">
      <div v-for="stage in stages" :key="stage.key" class="kanban-column">
        <div class="kanban-column-header">
          <span class="kanban-column-title">{{ stage.label }}</span>
          <el-tag size="small" type="info">{{ stage.list.length }}</el-tag>
        </div>
        <div class="kanban-column-body">
          <div
            v-for="item in stage.list"
            :key="item.id"
            class="kanban-card"
            draggable="true"
            @dragstart="onDragStart($event, item)"
            @dragover.prevent="onDragOver($event, stage.key)"
            @drop="onDrop($event, stage.key)"
            @click="showDetail(item)"
          >
            <div class="card-title">{{ item.name }}</div>
            <div class="card-customer">{{ item.customerName }}</div>
            <div class="card-meta">
              <span>¥{{ (item.amount / 10000).toFixed(1) }}万</span>
              <span>赢率 {{ item.probability }}%</span>
            </div>
            <div class="card-footer">
              <span class="card-owner">{{ item.owner }}</span>
              <span class="card-date">{{ item.expectedCloseDate }}</span>
            </div>
          </div>
          <el-empty v-if="!stage.list.length" :image-size="60" description="暂无" />
        </div>
      </div>
    </div>

    <!-- List View -->
    <div v-else class="table-card" v-loading="loading">
      <el-table :data="oppList" border stripe>
        <el-table-column prop="name" label="商机名称" min-width="150" />
        <el-table-column prop="customerName" label="客户" width="140" />
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="{ row }">¥{{ row.amount.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="stage" label="阶段" width="100">
          <template #default="{ row }">
            <el-tag :type="stageTagType(row.stage)" size="small">{{ row.stage }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="probability" label="赢率" width="70">
          <template #default="{ row }">{{ row.probability }}%</template>
        </el-table-column>
        <el-table-column prop="owner" label="负责人" width="80" />
        <el-table-column prop="expectedCloseDate" label="预计成交" width="110" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="showDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.current"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          layout="total, prev, pager, next"
          @current-change="fetchData"
        />
      </div>
    </div>

    <!-- Create Dialog -->
    <el-dialog v-model="createDialogVisible" title="新建商机" width="550px">
      <el-form :model="createForm" ref="createFormRef" :rules="createRules" label-width="110px">
        <el-form-item label="商机名称" prop="name">
          <el-input v-model="createForm.name" placeholder="请输入" />
        </el-form-item>
        <el-form-item label="客户名称" prop="customerName">
          <el-input v-model="createForm.customerName" placeholder="请输入" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="商机金额" prop="amount">
              <el-input-number v-model="createForm.amount" :min="0" :step="10000" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="赢率" prop="probability">
              <el-slider v-model="createForm.probability" :min="0" :max="100" :format-tooltip="(v: number) => v + '%'" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="所处阶段" prop="stage">
          <el-select v-model="createForm.stage" placeholder="请选择" style="width: 100%">
            <el-option v-for="s in stageOptions" :key="s.key" :label="s.label" :value="s.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="预计成交日" prop="expectedCloseDate">
          <el-date-picker v-model="createForm.expectedCloseDate" type="date" placeholder="选择日期" style="width: 100%" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="createForm.owner" placeholder="请选择" style="width: 100%">
            <el-option label="张三" value="张三" />
            <el-option label="李四" value="李四" />
            <el-option label="王五" value="王五" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleCreate">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import dayjs from 'dayjs'

const loading = ref(false)
const viewMode = ref('kanban')
const createDialogVisible = ref(false)
const submitLoading = ref(false)
const createFormRef = ref<FormInstance>()
const oppList = ref<any[]>([])
const dragItem = ref<any>(null)

const stageOptions = [
  { key: '初步沟通', label: '初步沟通' },
  { key: '意向客户', label: '意向客户' },
  { key: '方案演示', label: '方案演示' },
  { key: '报价', label: '报价' },
  { key: '签约', label: '签约' },
]

const stages = ref(stageOptions.map((s) => ({ ...s, list: [] as any[] })))

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
})

const createForm = reactive({
  name: '',
  customerName: '',
  amount: 100000,
  probability: 50,
  stage: '初步沟通',
  expectedCloseDate: '',
  owner: '张三',
})

const createRules: FormRules = {
  name: [{ required: true, message: '请输入商机名称', trigger: 'blur' }],
  customerName: [{ required: true, message: '请输入客户名称', trigger: 'blur' }],
  amount: [{ required: true, message: '请输入金额', trigger: 'blur' }],
  stage: [{ required: true, message: '请选择阶段', trigger: 'change' }],
  expectedCloseDate: [{ required: true, message: '请选择预计成交日', trigger: 'change' }],
}

function stageTagType(stage: string) {
  const map: Record<string, string> = {
    初步沟通: 'info',
    意向客户: 'primary',
    方案演示: 'warning',
    报价: 'danger',
    签约: 'success',
  }
  return map[stage] || 'info'
}

function fetchData() {
  loading.value = true
  setTimeout(() => {
    const allItems = []
    for (let i = 0; i < 30; i++) {
      const stage = stageOptions[i % stageOptions.length].key
      allItems.push({
        id: i + 1,
        name: `商机${String(i + 1).padStart(3, '0')}`,
        customerName: `客户${String(i + 1).padStart(3, '0')}`,
        amount: Math.floor(Math.random() * 1000000) + 50000,
        probability: Math.floor(Math.random() * 60) + 20,
        stage,
        owner: ['张三', '李四', '王五'][i % 3],
        expectedCloseDate: dayjs().add(i * 3, 'day').format('YYYY-MM-DD'),
      })
    }
    oppList.value = allItems

    // Organize into stages
    for (const stage of stages.value) {
      stage.list = allItems.filter((item) => item.stage === stage.key)
    }

    pagination.total = allItems.length
    loading.value = false
  }, 300)
}

function onDragStart(event: DragEvent, item: any) {
  dragItem.value = item
  event.dataTransfer?.setData('text/plain', '')
}

function onDragOver(event: DragEvent, _targetStage: string) {
  event.preventDefault()
}

function onDrop(_event: DragEvent, targetStage: string) {
  if (!dragItem.value) return
  const item = dragItem.value
  item.stage = targetStage

  // Update kanban lists
  for (const stage of stages.value) {
    stage.list = stage.list.filter((i: any) => i.id !== item.id)
  }
  const target = stages.value.find((s) => s.key === targetStage)
  if (target) {
    target.list.push(item)
  }

  dragItem.value = null
  ElMessage.success(`已移至 ${targetStage}`)
}

function showDetail(item: any) {
  ElMessage.info(`查看商机详情: ${item.name}`)
}

function showCreateDialog() {
  createForm.name = ''
  createForm.customerName = ''
  createForm.amount = 100000
  createForm.probability = 50
  createForm.stage = '初步沟通'
  createForm.expectedCloseDate = ''
  createForm.owner = '张三'
  createDialogVisible.value = true
}

async function handleCreate() {
  if (!createFormRef.value) return
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  setTimeout(() => {
    ElMessage.success('创建成功')
    createDialogVisible.value = false
    submitLoading.value = false
    fetchData()
  }, 500)
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.action-bar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
}

.kanban-board {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 12px;
  min-height: 500px;
}

.kanban-column {
  flex: 1;
  min-width: 200px;
  background: #f5f7fa;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}

.kanban-column-header {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid #ebeef5;
}

.kanban-column-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.kanban-column-body {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
}

.kanban-card {
  background: #fff;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: box-shadow 0.2s;
  border: 1px solid #ebeef5;
}

.kanban-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.card-customer {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #409EFF;
  font-weight: 500;
  margin-bottom: 8px;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #c0c4cc;
}

.table-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
}

.pagination-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
