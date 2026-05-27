<template>
  <div class="system-role-page">
    <!-- Actions -->
    <div class="action-bar">
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        新增角色
      </el-button>
    </div>

    <!-- Table -->
    <div class="table-card" v-loading="loading">
      <el-table :data="roleList" border stripe>
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="name" label="角色名称" min-width="140" />
        <el-table-column prop="code" label="角色编码" width="140" />
        <el-table-column prop="description" label="描述" min-width="200" />
        <el-table-column prop="userCount" label="用户数" width="80" align="center" />
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
          layout="total, prev, pager, next"
          @current-change="fetchData"
        />
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑角色' : '新增角色'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="90px"
      >
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入角色名称" />
        </el-form-item>
        <el-form-item label="角色编码" prop="code">
          <el-input v-model="formData.code" placeholder="请输入角色编码（如：admin）" :disabled="isEdit" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="formData.description" type="textarea" :rows="3" placeholder="请输入角色描述" />
        </el-form-item>
        <el-divider>权限设置</el-divider>
        <el-form-item label="权限">
          <div class="permission-tree-wrap">
            <el-tree
              ref="treeRef"
              :data="permissionTree"
              show-checkbox
              node-key="id"
              default-expand-all
              :props="{ label: 'label', children: 'children' }"
              @check="handleTreeCheck"
            />
          </div>
        </el-form-item>
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

const loading = ref(false)
const roleList = ref<any[]>([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref<FormInstance>()
const treeRef = ref<any>()
const editId = ref<number | null>(null)
const checkedKeys = ref<string[]>([])

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
})

const formData = reactive({
  name: '',
  code: '',
  description: '',
})

const formRules: FormRules = {
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
}

const permissionTree = ref([
  {
    id: 'dashboard',
    label: '工作台',
    children: [
      { id: 'dashboard:view', label: '查看' },
    ],
  },
  {
    id: 'customer',
    label: '客户管理',
    children: [
      { id: 'customer:list', label: '客户列表' },
      { id: 'customer:create', label: '新增客户' },
      { id: 'customer:edit', label: '编辑客户' },
      { id: 'customer:delete', label: '删除客户' },
      { id: 'customer:clue', label: '线索管理' },
    ],
  },
  {
    id: 'sales',
    label: '销售管理',
    children: [
      { id: 'sales:opportunity', label: '商机管理' },
      { id: 'sales:order', label: '订单管理' },
    ],
  },
  {
    id: 'recording',
    label: '录音管理',
    children: [
      { id: 'recording:list', label: '录音列表' },
      { id: 'recording:upload', label: '上传录音' },
      { id: 'recording:transcription', label: '转写分析' },
    ],
  },
  {
    id: 'ai',
    label: 'AI分析',
    children: [
      { id: 'ai:dashboard', label: '分析看板' },
    ],
  },
  {
    id: 'system',
    label: '系统管理',
    children: [
      { id: 'system:user', label: '用户管理' },
      { id: 'system:role', label: '角色管理' },
      { id: 'system:knowledge', label: '知识库' },
    ],
  },
])

function fetchData() {
  loading.value = true
  setTimeout(() => {
    roleList.value = [
      { id: 1, name: '管理员', code: 'admin', description: '系统管理员，拥有所有权限', userCount: 3 },
      { id: 2, name: '销售经理', code: 'sales_manager', description: '销售部门经理', userCount: 5 },
      { id: 3, name: '销售代表', code: 'sales_rep', description: '一线销售人员', userCount: 15 },
      { id: 4, name: '客服专员', code: 'cs_rep', description: '客服人员', userCount: 8 },
      { id: 5, name: '市场专员', code: 'marketing', description: '市场推广人员', userCount: 4 },
    ]
    pagination.total = 5
    loading.value = false
  }, 300)
}

function showCreateDialog() {
  isEdit.value = false
  editId.value = null
  formData.name = ''
  formData.code = ''
  formData.description = ''
  checkedKeys.value = []
  if (treeRef.value) treeRef.value.setCheckedKeys([])
  dialogVisible.value = true
}

function showEditDialog(row: any) {
  isEdit.value = true
  editId.value = row.id
  formData.name = row.name
  formData.code = row.code
  formData.description = row.description
  checkedKeys.value = ['dashboard:view', 'customer:list']
  if (treeRef.value) {
    treeRef.value.setCheckedKeys(checkedKeys.value)
  }
  dialogVisible.value = true
}

function handleTreeCheck(_data: any, { checkedKeys: keys }: { checkedKeys: string[] }) {
  checkedKeys.value = keys
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
  ElMessageBox.confirm(`确定删除角色 "${row.name}" 吗？`, '确认删除', {
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

.permission-tree-wrap {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 12px;
  width: 100%;
}
</style>
