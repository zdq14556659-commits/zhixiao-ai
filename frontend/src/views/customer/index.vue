<template>
  <div class="customer-page">
    <!-- Search Form -->
    <div class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="客户名称">
          <el-input v-model="searchForm.name" placeholder="请输入" clearable />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="searchForm.phone" placeholder="请输入" clearable />
        </el-form-item>
        <el-form-item label="客户阶段">
          <el-select v-model="searchForm.stage" placeholder="请选择" clearable style="width: 140px">
            <el-option label="初步沟通" value="初步沟通" />
            <el-option label="意向客户" value="意向客户" />
            <el-option label="方案演示" value="方案演示" />
            <el-option label="报价" value="报价" />
            <el-option label="签约" value="签约" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="searchForm.owner" placeholder="请选择" clearable style="width: 140px">
            <el-option label="张三" value="张三" />
            <el-option label="李四" value="李四" />
            <el-option label="王五" value="王五" />
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
        新增客户
      </el-button>
    </div>

    <!-- Table -->
    <div class="table-card" v-loading="loading">
      <el-table :data="customerList" border stripe style="width: 100%">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="name" label="客户名称" min-width="140">
          <template #default="{ row }">
            <el-link type="primary" :underline="false" @click="goDetail(row.id)">
              {{ row.name }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column prop="industry" label="行业" width="110" />
        <el-table-column prop="stage" label="阶段" width="100">
          <template #default="{ row }">
            <el-tag :type="stageTagType(row.stage)" size="small">{{ row.stage }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="intentionLevel" label="意向等级" width="100" align="center">
          <template #default="{ row }">
            <el-rate v-model="row.intentionLevel" :max="5" disabled text-color="#ff9900" />
          </template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="90" />
        <el-table-column prop="owner" label="负责人" width="80" />
        <el-table-column prop="nextContactTime" label="下次联系时间" width="150" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="showEditDialog(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.current"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchData"
          @current-change="fetchData"
        />
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑客户' : '新增客户'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="100px"
        label-position="right"
      >
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="客户名称" prop="name">
              <el-input v-model="formData.name" placeholder="请输入客户名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="行业" prop="industry">
              <el-select v-model="formData.industry" placeholder="请选择" style="width: 100%">
                <el-option label="科技" value="科技" />
                <el-option label="金融" value="金融" />
                <el-option label="医疗" value="医疗" />
                <el-option label="教育" value="教育" />
                <el-option label="制造" value="制造" />
                <el-option label="零售" value="零售" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="客户来源" prop="source">
              <el-select v-model="formData.source" placeholder="请选择" style="width: 100%">
                <el-option label="线上推广" value="线上推广" />
                <el-option label="电话营销" value="电话营销" />
                <el-option label="客户推荐" value="客户推荐" />
                <el-option label="线下活动" value="线下活动" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="电话" prop="phone">
              <el-input v-model="formData.phone" placeholder="请输入电话" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="地址" prop="address">
          <el-input v-model="formData.address" placeholder="请输入地址" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="客户阶段" prop="stage">
              <el-select v-model="formData.stage" placeholder="请选择" style="width: 100%">
                <el-option label="初步沟通" value="初步沟通" />
                <el-option label="意向客户" value="意向客户" />
                <el-option label="方案演示" value="方案演示" />
                <el-option label="报价" value="报价" />
                <el-option label="签约" value="签约" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="意向等级" prop="intentionLevel">
              <el-rate v-model="formData.intentionLevel" :max="5" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import dayjs from 'dayjs'

const router = useRouter()

const loading = ref(false)
const customerList = ref<any[]>([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref<FormInstance>()
const editId = ref<number | null>(null)

const searchForm = reactive({
  name: '',
  phone: '',
  stage: '',
  owner: '',
})

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
})

const defaultFormData = {
  name: '',
  industry: '',
  source: '',
  phone: '',
  address: '',
  stage: '初步沟通',
  intentionLevel: 3,
}

const formData = reactive({ ...defaultFormData })

const formRules: FormRules = {
  name: [{ required: true, message: '请输入客户名称', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入电话', trigger: 'blur' }],
  stage: [{ required: true, message: '请选择客户阶段', trigger: 'change' }],
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
  // Simulate API call
  setTimeout(() => {
    const list = []
    for (let i = 0; i < pagination.pageSize; i++) {
      const index = (pagination.current - 1) * pagination.pageSize + i + 1
      if (index > 58) break
      list.push({
        id: index,
        name: `客户${String(index).padStart(4, '0')}`,
        phone: `138${String(10000000 + index).slice(0, 8)}`,
        industry: ['科技', '金融', '医疗', '教育', '制造', '零售'][index % 6],
        stage: ['初步沟通', '意向客户', '方案演示', '报价', '签约'][index % 5],
        intentionLevel: (index % 5) + 1,
        source: ['线上推广', '电话营销', '客户推荐', '线下活动', '其他'][index % 5],
        owner: ['张三', '李四', '王五'][index % 3],
        nextContactTime: dayjs().add(index, 'day').format('YYYY-MM-DD HH:mm'),
      })
    }
    customerList.value = list
    pagination.total = 58
    loading.value = false
  }, 300)
}

function handleSearch() {
  pagination.current = 1
  fetchData()
}

function handleReset() {
  searchForm.name = ''
  searchForm.phone = ''
  searchForm.stage = ''
  searchForm.owner = ''
  handleSearch()
}

function showCreateDialog() {
  isEdit.value = false
  editId.value = null
  Object.assign(formData, defaultFormData)
  dialogVisible.value = true
}

function showEditDialog(row: any) {
  isEdit.value = true
  editId.value = row.id
  Object.assign(formData, {
    name: row.name,
    industry: row.industry,
    source: row.source,
    phone: row.phone,
    address: row.address || '',
    stage: row.stage,
    intentionLevel: row.intentionLevel,
  })
  dialogVisible.value = true
}

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  setTimeout(() => {
    ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
    dialogVisible.value = false
    submitLoading.value = false
    fetchData()
  }, 500)
}

function handleDelete(row: any) {
  ElMessageBox.confirm(`确定删除客户 "${row.name}" 吗？`, '确认删除', {
    type: 'warning',
    confirmButtonText: '确定',
    cancelButtonText: '取消',
  }).then(() => {
    ElMessage.success('删除成功')
    fetchData()
  }).catch(() => {})
}

function goDetail(id: number) {
  router.push(`/customer/detail/${id}`)
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
