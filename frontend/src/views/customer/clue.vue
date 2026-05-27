<template>
  <div class="clue-page">
    <!-- Search -->
    <div class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="客户名称">
          <el-input v-model="searchForm.customerName" placeholder="请输入" clearable />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择" clearable style="width: 120px">
            <el-option label="待分配" value="待分配" />
            <el-option label="跟进中" value="跟进中" />
            <el-option label="已转化" value="已转化" />
            <el-option label="已放弃" value="已放弃" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- Actions -->
    <div class="action-bar">
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        新增线索
      </el-button>
    </div>

    <!-- Table -->
    <div class="table-card" v-loading="loading">
      <el-table :data="clueList" border stripe style="width: 100%">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="customerName" label="客户名称" min-width="140" />
        <el-table-column prop="contact" label="联系人" width="90" />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column prop="source" label="来源" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="assignedTo" label="分配人" width="90" />
        <el-table-column prop="createdAt" label="创建时间" width="150" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" v-if="row.status === '待分配'" @click="showAssignDialog(row)">分配</el-button>
            <el-button type="success" link size="small" v-if="row.status === '跟进中'" @click="handleConvert(row)">转化</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
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

    <!-- Create Dialog -->
    <el-dialog v-model="createDialogVisible" title="新增线索" width="500px">
      <el-form :model="createForm" :rules="createRules" ref="createFormRef" label-width="90px">
        <el-form-item label="客户名称" prop="customerName">
          <el-input v-model="createForm.customerName" placeholder="请输入" />
        </el-form-item>
        <el-form-item label="联系人" prop="contact">
          <el-input v-model="createForm.contact" placeholder="请输入" />
        </el-form-item>
        <el-form-item label="电话" prop="phone">
          <el-input v-model="createForm.phone" placeholder="请输入" />
        </el-form-item>
        <el-form-item label="来源" prop="source">
          <el-select v-model="createForm.source" placeholder="请选择" style="width: 100%">
            <el-option label="线上推广" value="线上推广" />
            <el-option label="电话营销" value="电话营销" />
            <el-option label="客户推荐" value="客户推荐" />
            <el-option label="线下活动" value="线下活动" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleCreate">确定</el-button>
      </template>
    </el-dialog>

    <!-- Assign Dialog -->
    <el-dialog v-model="assignDialogVisible" title="分配线索" width="400px">
      <el-form :model="assignForm" label-width="80px">
        <el-form-item label="分配给">
          <el-select v-model="assignForm.owner" placeholder="请选择负责人" style="width: 100%">
            <el-option label="张三" value="张三" />
            <el-option label="李四" value="李四" />
            <el-option label="王五" value="王五" />
            <el-option label="赵六" value="赵六" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleAssign">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import dayjs from 'dayjs'

const loading = ref(false)
const clueList = ref<any[]>([])
const createDialogVisible = ref(false)
const assignDialogVisible = ref(false)
const submitLoading = ref(false)
const createFormRef = ref<FormInstance>()
const currentAssignRow = ref<any>(null)

const searchForm = reactive({
  customerName: '',
  status: '',
})

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
})

const createForm = reactive({
  customerName: '',
  contact: '',
  phone: '',
  source: '',
})

const createRules: FormRules = {
  customerName: [{ required: true, message: '请输入客户名称', trigger: 'blur' }],
  contact: [{ required: true, message: '请输入联系人', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入电话', trigger: 'blur' }],
  source: [{ required: true, message: '请选择来源', trigger: 'change' }],
}

const assignForm = reactive({
  owner: '',
})

function statusTagType(status: string) {
  const map: Record<string, string> = {
    待分配: 'info',
    跟进中: 'primary',
    已转化: 'success',
    已放弃: 'danger',
  }
  return map[status] || 'info'
}

function fetchData() {
  loading.value = true
  setTimeout(() => {
    const list = []
    for (let i = 0; i < pagination.pageSize; i++) {
      const index = (pagination.current - 1) * pagination.pageSize + i + 1
      if (index > 36) break
      list.push({
        id: index,
        customerName: `线索客户${String(index).padStart(4, '0')}`,
        contact: ['张先生', '李女士', '王经理', '赵总监'][index % 4],
        phone: `138${String(10000000 + index).slice(0, 8)}`,
        source: ['线上推广', '电话营销', '客户推荐', '线下活动', '其他'][index % 5],
        status: ['待分配', '跟进中', '已转化', '已放弃'][index % 4],
        assignedTo: index % 2 === 0 ? '-' : ['张三', '李四'][index % 2],
        createdAt: dayjs().subtract(index, 'day').format('YYYY-MM-DD HH:mm'),
      })
    }
    clueList.value = list
    pagination.total = 36
    loading.value = false
  }, 300)
}

function handleSearch() {
  pagination.current = 1
  fetchData()
}

function handleReset() {
  searchForm.customerName = ''
  searchForm.status = ''
  handleSearch()
}

function showCreateDialog() {
  createForm.customerName = ''
  createForm.contact = ''
  createForm.phone = ''
  createForm.source = ''
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

function showAssignDialog(row: any) {
  currentAssignRow.value = row
  assignForm.owner = ''
  assignDialogVisible.value = true
}

function handleAssign() {
  if (!assignForm.owner) {
    ElMessage.warning('请选择负责人')
    return
  }
  ElMessage.success(`已分配给 ${assignForm.owner}`)
  assignDialogVisible.value = false
  fetchData()
}

function handleConvert(row: any) {
  ElMessageBox.confirm(`将线索 "${row.customerName}" 转化为客户？`, '确认转化', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'info',
  }).then(() => {
    ElMessage.success('转化成功')
    fetchData()
  }).catch(() => {})
}

function handleDelete(row: any) {
  ElMessageBox.confirm(`确定删除线索 "${row.customerName}" 吗？`, '确认删除', {
    type: 'warning',
    confirmButtonText: '确定',
    cancelButtonText: '取消',
  }).then(() => {
    ElMessage.success('删除成功')
    fetchData()
  }).catch(() => {})
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.search-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.action-bar {
  margin-bottom: 16px;
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
