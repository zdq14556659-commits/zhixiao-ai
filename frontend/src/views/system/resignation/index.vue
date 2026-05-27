<template>
  <div class="resignation-page">
    <!-- Title -->
    <div class="page-header">
      <h2>员工离职交接</h2>
      <p class="subtitle">确保客户资源不流失，一键完成交接</p>
    </div>

    <!-- Stats Cards -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="8">
        <el-card shadow="never" class="stat-card stat-pending">
          <div class="stat-value">{{ stats.pendingCount }}</div>
          <div class="stat-label">待交接人数</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never" class="stat-card stat-completed">
          <div class="stat-value">{{ stats.completedCount }}</div>
          <div class="stat-label">已交接人数</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never" class="stat-card stat-customers">
          <div class="stat-value">{{ stats.totalCustomers }}</div>
          <div class="stat-label">涉及客户数</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Table -->
    <el-card shadow="never" class="table-card">
      <el-table :data="resignations" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="name" label="员工姓名" min-width="120" />
        <el-table-column prop="department" label="部门" min-width="120" />
        <el-table-column prop="position" label="职位" min-width="120" />
        <el-table-column prop="resignDate" label="离职日期" min-width="120" />
        <el-table-column prop="customerCount" label="客户数" width="80" align="center" />
        <el-table-column prop="opportunityCount" label="商机数" width="80" align="center" />
        <el-table-column label="交接状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.handoverStatus === 'pending'" type="warning">待交接</el-tag>
            <el-tag v-else-if="row.handoverStatus === 'completed'" type="success">已交接</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="接收人" min-width="120">
          <template #default="{ row }">
            {{ row.handoverToName || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-button
              v-if="row.handoverStatus === 'pending'"
              type="primary"
              size="small"
              @click="openHandoverDialog(row)"
            >
              交接
            </el-button>
            <span v-else class="no-action">-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Handover Dialog -->
    <el-dialog v-model="handoverDialogVisible" title="客户资源交接" width="520px">
      <template v-if="currentRow">
        <div class="handover-info">
          <p>{{ currentRow.name }} 离职，涉及 {{ currentRow.customerCount }} 个客户、{{ currentRow.opportunityCount }} 个商机</p>
        </div>
        <el-form label-width="80px" class="handover-form">
          <el-form-item label="接收人">
            <el-select
              v-model="handoverToUserId"
              placeholder="请选择接收人"
              style="width: 100%"
              filterable
            >
              <el-option
                v-for="user in users"
                :key="user.id"
                :label="user.realName"
                :value="user.id"
              />
            </el-select>
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="handoverDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="confirmHandover">确认交接</el-button>
      </template>
    </el-dialog>

    <!-- Customer List Sub-dialog -->
    <el-dialog v-model="customerDialogVisible" title="已交接客户列表" width="600px">
      <el-table :data="customerList" v-loading="customerLoading" stripe style="width: 100%">
        <el-table-column type="index" label="序号" width="60" />
        <el-table-column prop="name" label="客户名称" min-width="150" />
        <el-table-column prop="contact" label="联系人" min-width="120" />
        <el-table-column prop="phone" label="联系电话" min-width="140" />
      </el-table>
      <template #footer>
        <el-button type="primary" @click="customerDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/api/request'

interface ResignationItem {
  id: number
  userId: number
  name: string
  department: string
  position: string
  resignDate: string
  customerCount: number
  opportunityCount: number
  handoverStatus: 'pending' | 'completed'
  handoverTo: number | null
  handoverAt: string | null
  handoverToName: string | null
}

interface User {
  id: number
  realName: string
}

interface Customer {
  name: string
  contact: string
  phone: string
}

// Data
const resignations = ref<ResignationItem[]>([])
const loading = ref(false)

const users = ref<User[]>([])

const handoverDialogVisible = ref(false)
const currentRow = ref<ResignationItem | null>(null)
const handoverToUserId = ref<number | null>(null)
const submitting = ref(false)

const customerDialogVisible = ref(false)
const customerList = ref<Customer[]>([])
const customerLoading = ref(false)

// Stats
const stats = computed(() => {
  const pending = resignations.value.filter(r => r.handoverStatus === 'pending').length
  const completed = resignations.value.filter(r => r.handoverStatus === 'completed').length
  const totalCustomers = resignations.value.reduce((sum, r) => sum + (r.customerCount || 0), 0)
  return { pendingCount: pending, completedCount: completed, totalCustomers }
})

// Fetch resignations
async function fetchResignations() {
  loading.value = true
  try {
    const res = await request.get('/api/resignations')
    resignations.value = res.data || []
  } catch {
    ElMessage.error('获取离职列表失败')
  } finally {
    loading.value = false
  }
}

// Fetch users
async function fetchUsers() {
  try {
    const res = await request.get('/api/users')
    users.value = res.data || []
  } catch {
    ElMessage.error('获取用户列表失败')
  }
}

// Open handover dialog
function openHandoverDialog(row: ResignationItem) {
  currentRow.value = row
  handoverToUserId.value = null
  handoverDialogVisible.value = true
}

// Confirm handover
async function confirmHandover() {
  if (!handoverToUserId.value) {
    ElMessage.warning('请选择接收人')
    return
  }
  if (!currentRow.value) return

  submitting.value = true
  try {
    await request.post(`/api/resignations/${currentRow.value.id}/handover`, {
      handoverToUserId: handoverToUserId.value,
    })
    ElMessage.success('交接成功')
    handoverDialogVisible.value = false
    await fetchResignations()
    await showCustomerList(currentRow.value.id)
  } catch {
    ElMessage.error('交接失败')
  } finally {
    submitting.value = false
  }
}

// Show customer list
async function showCustomerList(id: number) {
  customerLoading.value = true
  try {
    const res = await request.get(`/api/resignations/${id}/customers`)
    customerList.value = res.data || []
  } catch {
    ElMessage.error('获取客户列表失败')
  } finally {
    customerLoading.value = false
  }
  customerDialogVisible.value = true
}

onMounted(() => {
  fetchResignations()
  fetchUsers()
})
</script>

<style scoped>
.resignation-page {
  padding: 24px;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.subtitle {
  margin: 6px 0 0;
  font-size: 14px;
  color: #909399;
}

.stats-row {
  margin-bottom: 24px;
}

.stat-card {
  border-radius: 8px;
  text-align: center;
  padding: 8px 0;
}

.stat-pending {
  background: linear-gradient(135deg, #fdf6ec, #fef0e7);
  border: 1px solid #fbe2c5;
}

.stat-completed {
  background: linear-gradient(135deg, #f0f9eb, #e8f5e0);
  border: 1px solid #d4edc4;
}

.stat-customers {
  background: linear-gradient(135deg, #ecf5ff, #e0edff);
  border: 1px solid #c8dcf5;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.4;
}

.stat-pending .stat-value {
  color: #e6a23c;
}

.stat-completed .stat-value {
  color: #67c23a;
}

.stat-customers .stat-value {
  color: #409eff;
}

.stat-label {
  font-size: 14px;
  color: #606266;
  margin-top: 4px;
}

.table-card {
  border-radius: 8px;
}

.no-action {
  color: #c0c4cc;
}

.handover-info {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 20px;
}

.handover-info p {
  margin: 0;
  font-size: 14px;
  color: #606266;
}

.handover-form {
  margin-top: 8px;
}
</style>
