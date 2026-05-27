<template>
  <div class="knowledge-page">
    <!-- Search & Stats Bar -->
    <el-card shadow="never" class="search-card">
      <el-row :gutter="16" align="middle">
        <el-col :span="14">
          <el-input
            v-model="searchQuery"
            placeholder="AI智能搜索知识库，输入关键词..."
            size="large"
            clearable
            @input="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
            <template #append>
              <el-button @click="handleSearch">AI搜索</el-button>
            </template>
          </el-input>
        </el-col>
        <el-col :span="10" style="text-align: right">
          <div class="kb-stats">
            <span class="kb-stat-item"><b>{{ totalItems }}</b> 条知识</span>
            <span class="kb-stat-divider">|</span>
            <span class="kb-stat-item"><b>{{ totalRefs }}</b> 次被引用</span>
            <span class="kb-stat-divider">|</span>
            <el-button type="primary" @click="showCreateDialog">
              <el-icon><Plus /></el-icon>新增知识
            </el-button>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- AI Search Results -->
    <el-card v-if="showAiSearch && searchQuery" shadow="never" class="ai-search-card">
      <template #header>
        <span><el-icon><MagicStick /></el-icon> AI智能搜索结果 — "{{ searchQuery }}"</span>
      </template>
      <div v-if="aiResults.length === 0" style="padding:20px;text-align:center;color:#999">
        未找到匹配的知识条目
      </div>
      <div v-for="item in aiResults" :key="item.id" class="ai-result-item" @click="showDetail(item)">
        <div class="ai-result-title">
          <el-tag size="small" :type="tagType(item.category)" style="margin-right:8px">{{ categoryLabel(item.category) }}</el-tag>
          {{ item.title }}
          <el-tag v-if="item.matchField === 'content'" size="small" type="warning" style="margin-left:8px">内容匹配</el-tag>
        </div>
        <div class="ai-result-snippet">{{ item.snippet }}</div>
        <div class="ai-result-meta">
          <span>引用 {{ item.referenceCount || 0 }} 次</span>
        </div>
      </div>
    </el-card>

    <!-- Category Tabs -->
    <el-card shadow="never" class="tabs-card">
      <el-tabs v-model="activeCategory" @tab-change="fetchData">
        <el-tab-pane v-for="cat in categories" :key="cat.key" :label="cat.label" :name="cat.key" />
      </el-tabs>

      <!-- Table -->
      <div v-loading="loading">
        <el-table :data="knowledgeList" border stripe @row-click="showDetail">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="title" label="标题" min-width="220">
            <template #default="{ row }">
              <div class="kb-title-cell">
                <span>{{ row.title }}</span>
                <el-tag v-if="row.id >= 5" size="small" type="success" style="margin-left:6px">Q&A</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="category" label="分类" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="tagType(row.category)">{{ categoryLabel(row.category) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="tags" label="标签" min-width="160">
            <template #default="{ row }">
              <el-tag v-for="tag in (row.tags || '').split(',')" :key="tag" size="small" type="info" style="margin-right:4px;margin-bottom:2px">{{ tag }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="引用次数" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="(row.referenceCount || 0) > 20 ? 'danger' : (row.referenceCount || 0) > 10 ? 'warning' : 'info'" size="small" effect="plain">
                {{ row.referenceCount || 0 }} 次
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdBy" label="创建人" width="90" />
          <el-table-column prop="createdAt" label="创建时间" width="150" />
          <el-table-column label="操作" width="130" fixed="right" @click.stop>
            <template #default="{ row }">
              <el-button type="primary" link size="small" @click.stop="showEditDialog(row)">编辑</el-button>
              <el-button type="danger" link size="small" @click.stop="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrap">
          <el-pagination v-model:current-page="pagination.current" v-model:page-size="pagination.pageSize" :total="pagination.total" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next, jumper" @size-change="fetchData" @current-change="fetchData" />
        </div>
      </div>
    </el-card>

    <!-- Detail Dialog -->
    <el-dialog v-model="detailVisible" :title="detailData?.title || '知识详情'" width="700px" :close-on-click-modal="false">
      <div v-if="detailData" class="detail-content">
        <div class="detail-meta-row">
          <el-tag size="small" :type="tagType(detailData.category)">{{ categoryLabel(detailData.category) }}</el-tag>
          <span style="margin-left:12px;color:#999">引用 {{ detailData.referenceCount || 0 }} 次</span>
          <span style="margin-left:12px;color:#999">创建于 {{ detailData.createdAt }}</span>
        </div>
        <div class="detail-tags" v-if="detailData.tags">
          <el-tag v-for="tag in (detailData.tags || '').split(',')" :key="tag" size="small" type="info" style="margin-right:4px">{{ tag }}</el-tag>
        </div>
        <div class="detail-body">{{ detailData.content }}</div>
        <div v-if="detailData.answers" class="detail-qa">
          <div class="qa-title">📋 关联问答</div>
          <div v-for="(ans, i) in detailData.answers" :key="i" class="qa-item">
            <div class="qa-content">{{ ans.content }}</div>
            <div class="qa-score">
              <el-rate v-model="ans.score" disabled :max="5" size="small" />
            </div>
          </div>
        </div>
        <div class="detail-actions">
          <el-button @click="showEditDialog(detailData)">编辑</el-button>
          <el-button type="primary" @click="detailVisible = false">关闭</el-button>
        </div>
      </div>
    </el-dialog>

    <!-- Create/Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑知识' : '新增知识'" width="700px" :close-on-click-modal="false">
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="80px">
        <el-form-item label="标题" prop="title">
          <el-input v-model="formData.title" placeholder="请输入知识标题" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="分类" prop="category">
              <el-select v-model="formData.category" placeholder="请选择" style="width:100%">
                <el-option v-for="cat in categories" :key="cat.key" :label="cat.label" :value="cat.key" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="标签">
              <el-select v-model="formData.tags" multiple filterable allow-create default-first-option placeholder="输入标签后回车" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="内容" prop="content">
          <el-input v-model="formData.content" type="textarea" :rows="10" placeholder="请输入知识内容" />
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
import request from '@/api/request'

const loading = ref(false)
const knowledgeList = ref<any[]>([])
const dialogVisible = ref(false)
const detailVisible = ref(false)
const detailData = ref<any>(null)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref<FormInstance>()
const editId = ref<number | null>(null)
const activeCategory = ref('all')
const searchQuery = ref('')
const showAiSearch = ref(false)
const aiResults = ref<any[]>([])
const totalItems = ref(0)
const totalRefs = ref(0)

const categories = [
  { key: 'all', label: '全部' },
  { key: 'product', label: '产品' },
  { key: 'pricing', label: '报价' },
  { key: 'competitor', label: '竞品' },
  { key: 'faq', label: '常见问答' },
  { key: 'process', label: '流程' },
]

function categoryLabel(key: string) {
  return categories.find(c => c.key === key)?.label || key
}

function tagType(cat: string) {
  const map: Record<string, string> = { product: 'primary', pricing: 'success', competitor: 'danger', faq: 'warning', process: 'info' }
  return map[cat] || 'info'
}

const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const formData = reactive({ title: '', category: 'product', tags: [] as string[], content: '' })
const formRules: FormRules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  content: [{ required: true, message: '请输入内容', trigger: 'blur' }],
}

async function fetchData() {
  loading.value = true
  try {
    const params: any = { page: pagination.current, size: pagination.pageSize }
    if (activeCategory.value !== 'all') params.category = activeCategory.value
    const res = await request.get('/knowledge/enhanced', { params })
    knowledgeList.value = res.data.records || res.data
    pagination.total = res.data.total || (Array.isArray(res.data) ? res.data.length : 0)
    totalItems.value = pagination.total
    totalRefs.value = knowledgeList.value.reduce((s: number, r: any) => s + (r.referenceCount || 0), 0)
  } catch { /* mock fallback */ }
  loading.value = false
}

async function handleSearch() {
  if (!searchQuery.value) { showAiSearch.value = false; fetchData(); return }
  showAiSearch.value = true
  try {
    const res = await request.get('/knowledge/ai-search', { params: { q: searchQuery.value } })
    aiResults.value = res.data || []
  } catch { aiResults.value = [] }
}

function showDetail(row: any) {
  detailData.value = row
  detailVisible.value = true
}

function showCreateDialog() {
  isEdit.value = false; editId.value = null
  formData.title = ''; formData.category = activeCategory.value === 'all' ? 'product' : activeCategory.value
  formData.tags = []; formData.content = ''
  dialogVisible.value = true
}

function showEditDialog(row: any) {
  isEdit.value = true; editId.value = row.id
  formData.title = row.title
  formData.category = row.category
  formData.tags = (row.tags || '').split(',').filter(Boolean)
  formData.content = row.content
  dialogVisible.value = true
}

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  submitLoading.value = true
  try {
    if (isEdit.value) {
      await request.put(`/knowledge/${editId.value}`, { ...formData, tags: formData.tags.join(',') })
    } else {
      await request.post('/knowledge', { ...formData, tags: formData.tags.join(',') })
    }
    ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
    dialogVisible.value = false
    fetchData()
  } catch { ElMessage.error('操作失败') }
  submitLoading.value = false
}

function handleDelete(row: any) {
  ElMessageBox.confirm(`确定删除知识 "${row.title}" 吗？`, '确认删除', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
    .then(async () => {
      try { await request.delete(`/knowledge/${row.id}`); ElMessage.success('删除成功'); fetchData() }
      catch { ElMessage.error('删除失败') }
    }).catch(() => {})
}

onMounted(() => fetchData())
</script>

<style scoped>
.knowledge-page { position: relative; }
.search-card { margin-bottom: 16px; }
.search-card :deep(.el-input-group__append) { background-color: #409EFF; border-color: #409EFF; }
.search-card :deep(.el-input-group__append .el-button) { color: #fff; background: transparent; border: none; }
.kb-stats { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.kb-stat-item { font-size: 14px; color: #606266; }
.kb-stat-item b { font-size: 20px; color: #303133; }
.kb-stat-divider { color: #dcdfe6; }
.ai-search-card { margin-bottom: 16px; }
.ai-result-item { padding: 12px 16px; border-bottom: 1px solid #f0f0f0; cursor: pointer; transition: background 0.2s; }
.ai-result-item:hover { background: #f5f7fa; }
.ai-result-title { font-size: 15px; font-weight: 500; color: #303133; margin-bottom: 6px; }
.ai-result-snippet { font-size: 13px; color: #909399; margin-bottom: 4px; }
.ai-result-meta { font-size: 12px; color: #c0c4cc; }
.tabs-card { min-height: 400px; }
.pagination-wrap { margin-top: 16px; display: flex; justify-content: flex-end; }
.kb-title-cell { display: flex; align-items: center; }
.detail-content { padding: 0 8px; }
.detail-meta-row { margin-bottom: 12px; }
.detail-tags { margin-bottom: 12px; }
.detail-body { font-size: 15px; line-height: 1.8; color: #303133; background: #fafafa; padding: 16px; border-radius: 8px; margin-bottom: 16px; white-space: pre-wrap; }
.detail-qa { background: #f0f9eb; padding: 16px; border-radius: 8px; margin-bottom: 16px; }
.qa-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
.qa-item { padding: 8px 0; border-bottom: 1px solid #e1f3d8; }
.qa-item:last-child { border-bottom: none; }
.qa-content { font-size: 14px; margin-bottom: 4px; }
.qa-score { display: flex; align-items: center; }
.detail-actions { margin-top: 16px; text-align: right; }
</style>
