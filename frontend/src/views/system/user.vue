<template>
  <div class="system-user-page">
    <!-- Search -->
    <div class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="用户名">
          <el-input v-model="searchForm.username" placeholder="请输入" clearable />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="searchForm.phone" placeholder="请输入" clearable />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width: 100px">
            <el-option label="启用" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchData">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- Actions -->
    <div class="action-bar">
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        新增用户
      </el-button>
    </div>

    <!-- Table -->
    <div class="table-card" v-loading="loading">
      <el-table :data="userList" border stripe>
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="username" label="用户名" min-width="110" />
        <el-table-column prop="realName" label="姓名" width="100" />
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column prop="jobTitle" label="职位" width="110" />
        <el-table-column prop="department" label="部门" width="110" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-switch
              :model-value="row.status === 1"
              :loading="row._switchLoading"
              @change="(val: boolean) => handleToggleStatus(row, val)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="lastLogin" label="最后登录" width="150" />
        <el-table-column label="操作" width="140" fixed="right">
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
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchData"
          @current-change="fetchData"
        />
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑用户' : '新增用户'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="90px"
      >
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="用户名" prop="username">
              <el-input v-model="formData.username" placeholder="请输入" :disabled="isEdit" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="姓名" prop="realName">
              <el-input v-model="formData.realName" placeholder="请输入" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="密码" prop="password" v-if="!isEdit">
              <el-input v-model="formData.password" type="password" placeholder="请输入" show-password />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="手机号" prop="phone">
              <el-input v-model="formData.phone" placeholder="请输入" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="formData.email" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="职位" prop="jobTitle">
              <el-input v-model="formData.jobTitle" placeholder="请输入" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="部门" prop="department">
              <el-input v-model="formData.department" placeholder="请输入" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="角色" prop="roleIds">
              <el-select v-model="formData.roleIds" multiple placeholder="请选择" style="width: 100%">
                <el-option label="管理员" value="1" />
                <el-option label="销售经理" value="2" />
                <el-option label="销售人员" value="3" />
                <el-option label="客服" value="4" />
              </el-select>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import dayjs from 'dayjs'

const loading = ref(false)
const userList = ref<any[]>([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref<FormInstance>()
const editId = ref<number | null>(null)

const searchForm = reactive({
  username: '',
  phone: '',
  status: null as number | null,
})

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
})

const defaultFormData = {
  username: '',
  realName: '',
  password: '',
  phone: '',
  email: '',
  jobTitle: '',
  department: '',
  roleIds: [] as string[],
}

const formData = reactive({ ...defaultFormData })

const formRules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  realName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
}

function fetchData() {
  loading.value = true
  setTimeout(() => {
    const list = []
    for (let i = 0; i < pagination.pageSize; i++) {
      const index = (pagination.current - 1) * pagination.pageSize + i + 1
      if (index > 35) break
      list.push({
        id: index,
        username: `user${String(index).padStart(3, '0')}`,
        realName: ['张三', '李四', '王五', '赵六', '钱七', '孙八'][index % 6],
        phone: `138${String(10000000 + index).slice(0, 8)}`,
        email: `user${index}@example.com`,
        jobTitle: ['销售经理', '销售代表', '客服专员', '市场专员'][index % 4],
        department: ['销售部', '客服部', '市场部'][index % 3],
        status: index % 5 === 0 ? 0 : 1,
        lastLogin: dayjs().subtract(index, 'day').format('YYYY-MM-DD HH:mm'),
      })
    }
    userList.value = list
    pagination.total = 35
    loading.value = false
  }, 300)
}

function handleReset() {
  searchForm.username = ''
  searchForm.phone = ''
  searchForm.status = null
  fetchData()
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
  formData.username = row.username
  formData.realName = row.realName
  formData.password = ''
  formData.phone = row.phone
  formData.email = row.email || ''
  formData.jobTitle = row.jobTitle || ''
  formData.department = row.department || ''
  formData.roleIds = []
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

function handleToggleStatus(row: any, val: boolean) {
  row._switchLoading = true
  setTimeout(() => {
    row.status = val ? 1 : 0
    row._switchLoading = false
    ElMessage.success(val ? '已启用' : '已禁用')
  }, 500)
}

function handleDelete(row: any) {
  ElMessageBox.confirm(`确定删除用户 "${row.realName}" 吗？`, '确认删除', {
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
