<template>
  <div class="detail-page" v-loading="loading">
    <div class="detail-header">
      <el-button text @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        返回客户列表
      </el-button>
      <h2 class="customer-name">{{ customer?.name || '客户详情' }}</h2>
    </div>

    <div v-if="customer" class="detail-body">
      <el-tabs v-model="activeTab" type="border-card">
        <!-- Basic Info Tab -->
        <el-tab-pane label="基本信息" name="info">
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">客户名称</span>
              <span class="info-value">{{ customer.name }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">电话</span>
              <span class="info-value">{{ customer.phone }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">行业</span>
              <span class="info-value">{{ customer.industry }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">客户来源</span>
              <span class="info-value">{{ customer.source }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">客户阶段</span>
              <span class="info-value">
                <el-tag :type="stageTagType(customer.stage)" size="small">{{ customer.stage }}</el-tag>
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">意向等级</span>
              <span class="info-value">
                <el-rate v-model="customer.intentionLevel" :max="5" disabled text-color="#ff9900" />
              </span>
            </div>
            <div class="info-item full-width">
              <span class="info-label">地址</span>
              <span class="info-value">{{ customer.address || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">负责人</span>
              <span class="info-value">{{ customer.owner || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">创建时间</span>
              <span class="info-value">{{ customer.createdAt }}</span>
            </div>
          </div>
          <div class="info-actions">
            <el-button type="primary" size="small" @click="editBasicInfo">编辑</el-button>
          </div>
        </el-tab-pane>

        <!-- Contacts Tab -->
        <el-tab-pane label="联系人" name="contacts">
          <div class="tab-actions">
            <el-button type="primary" size="small" @click="showAddContact">
              <el-icon><Plus /></el-icon>
              添加联系人
            </el-button>
          </div>
          <el-table :data="contacts" border stripe size="small">
            <el-table-column prop="name" label="姓名" min-width="100" />
            <el-table-column prop="phone" label="电话" width="130" />
            <el-table-column prop="position" label="职位" width="120" />
            <el-table-column prop="email" label="邮箱" min-width="160" />
            <el-table-column prop="isPrimary" label="主要联系人" width="100" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.isPrimary" type="success" size="small">是</el-tag>
                <span v-else>否</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140">
              <template #default="{ row }">
                <el-button type="primary" link size="small">编辑</el-button>
                <el-button type="danger" link size="small">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- Communications Tab -->
        <el-tab-pane label="沟通记录" name="communications">
          <el-empty v-if="!communications.length" description="暂无沟通记录" />
          <div v-else class="timeline">
            <div v-for="(item, i) in communications" :key="i" class="timeline-item">
              <div class="timeline-dot" :style="{ background: item.type === 'call' ? '#409EFF' : '#67c23a' }"></div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-type">{{ item.type === 'call' ? '电话沟通' : '面谈' }}</span>
                  <span class="timeline-time">{{ item.time }}</span>
                </div>
                <p class="timeline-text">{{ item.content }}</p>
                <div class="timeline-meta">
                  <span>负责人: {{ item.owner }}</span>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- Opportunities Tab -->
        <el-tab-pane label="商机" name="opportunities">
          <el-table :data="opportunities" border stripe size="small">
            <el-table-column prop="name" label="商机名称" min-width="140" />
            <el-table-column prop="amount" label="金额" width="120">
              <template #default="{ row }">¥{{ row.amount.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="stage" label="阶段" width="100">
              <template #default="{ row }">
                <el-tag :type="stageTagType(row.stage)" size="small">{{ row.stage }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="probability" label="赢率" width="80">
              <template #default="{ row }">{{ row.probability }}%</template>
            </el-table-column>
            <el-table-column prop="expectedCloseDate" label="预计成交日" width="120" />
            <el-table-column prop="owner" label="负责人" width="80" />
          </el-table>
        </el-tab-pane>

        <!-- Recordings Tab -->
        <el-tab-pane label="录音" name="recordings">
          <el-table :data="recordings" border stripe size="small">
            <el-table-column prop="fileName" label="文件名" min-width="160" />
            <el-table-column prop="duration" label="时长" width="80" />
            <el-table-column prop="callType" label="通话类型" width="100" />
            <el-table-column prop="createdAt" label="录音时间" width="150" />
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button type="primary" link size="small">播放</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-empty v-else-if="!loading" description="未找到客户信息" />

    <!-- Add Contact Dialog -->
    <el-dialog v-model="contactDialogVisible" title="添加联系人" width="500px">
      <el-form :model="contactForm" label-width="80px">
        <el-form-item label="姓名" required>
          <el-input v-model="contactForm.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="电话" required>
          <el-input v-model="contactForm.phone" placeholder="请输入电话" />
        </el-form-item>
        <el-form-item label="职位">
          <el-input v-model="contactForm.position" placeholder="请输入职位" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="contactForm.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="主要联系人">
          <el-switch v-model="contactForm.isPrimary" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="contactDialogVisible = false">取消</el-button>
        <el-button type="primary">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const activeTab = ref('info')
const customer = ref<any>(null)
const contacts = ref<any[]>([])
const communications = ref<any[]>([])
const opportunities = ref<any[]>([])
const recordings = ref<any[]>([])
const contactDialogVisible = ref(false)

const contactForm = ref({
  name: '',
  phone: '',
  position: '',
  email: '',
  isPrimary: false,
})

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

function goBack() {
  router.push('/customer/list')
}

function editBasicInfo() {
  router.push(`/customer/list?edit=${route.params.id}`)
}

function showAddContact() {
  contactForm.value = { name: '', phone: '', position: '', email: '', isPrimary: false }
  contactDialogVisible.value = true
}

function fetchDetail() {
  const id = Number(route.params.id)
  if (!id) {
    loading.value = false
    return
  }

  loading.value = true
  setTimeout(() => {
    customer.value = {
      id,
      name: `客户${String(id).padStart(4, '0')}`,
      phone: `138${String(10000000 + id).slice(0, 8)}`,
      industry: ['科技', '金融', '医疗', '教育'][id % 4],
      source: ['线上推广', '电话营销', '客户推荐'][id % 3],
      stage: ['初步沟通', '意向客户', '方案演示', '报价', '签约'][id % 5],
      intentionLevel: (id % 5) + 1,
      address: '广东省深圳市南山区科技园',
      owner: ['张三', '李四', '王五'][id % 3],
      createdAt: dayjs().subtract(id, 'day').format('YYYY-MM-DD HH:mm'),
    }

    contacts.value = [
      { name: '张经理', phone: '138****5678', position: '采购经理', email: 'zhang@example.com', isPrimary: true },
      { name: '李总监', phone: '139****9012', position: '技术总监', email: 'li@example.com', isPrimary: false },
    ]

    communications.value = [
      { type: 'call', time: dayjs().subtract(1, 'day').format('YYYY-MM-DD HH:mm'), content: '初步沟通了产品需求，客户对数据分析功能感兴趣，约定下周进行方案演示。', owner: '张三' },
      { type: 'meeting', time: dayjs().subtract(3, 'day').format('YYYY-MM-DD HH:mm'), content: '上门拜访，展示了产品核心功能，客户表示需要内部评估后反馈。', owner: '李四' },
      { type: 'call', time: dayjs().subtract(7, 'day').format('YYYY-MM-DD HH:mm'), content: '首次电话接触，了解了客户的基本情况和需求。', owner: '张三' },
    ]

    opportunities.value = [
      { name: '数据分析平台采购', amount: 500000, stage: '方案演示', probability: 60, expectedCloseDate: dayjs().add(30, 'day').format('YYYY-MM-DD'), owner: '张三' },
      { name: 'CRM系统升级', amount: 200000, stage: '初步沟通', probability: 30, expectedCloseDate: dayjs().add(60, 'day').format('YYYY-MM-DD'), owner: '李四' },
    ]

    recordings.value = [
      { fileName: '20250115_沟通录音_001.mp3', duration: '05:23', callType: '呼出', createdAt: dayjs().subtract(1, 'day').format('YYYY-MM-DD HH:mm') },
      { fileName: '20250113_沟通录音_002.mp3', duration: '08:15', callType: '呼入', createdAt: dayjs().subtract(3, 'day').format('YYYY-MM-DD HH:mm') },
    ]

    loading.value = false
  }, 300)
}

onMounted(() => {
  fetchDetail()
})
</script>

<style scoped>
.detail-header {
  margin-bottom: 16px;
}

.detail-header h2 {
  margin: 8px 0 0;
  font-size: 20px;
  color: #303133;
}

.customer-name {
  display: inline-block;
  margin-left: 12px !important;
}

.detail-body {
  background: #fff;
  border-radius: 8px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-label {
  font-size: 12px;
  color: #909399;
}

.info-value {
  font-size: 14px;
  color: #303133;
}

.info-actions {
  padding: 0 20px 20px;
}

.tab-actions {
  margin-bottom: 12px;
}

.timeline {
  padding: 16px 20px;
}

.timeline-item {
  display: flex;
  gap: 12px;
  padding-bottom: 20px;
  position: relative;
}

.timeline-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 16px;
  bottom: 0;
  width: 2px;
  background: #ebeef5;
}

.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
  z-index: 1;
}

.timeline-content {
  flex: 1;
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.timeline-type {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.timeline-time {
  font-size: 12px;
  color: #909399;
}

.timeline-text {
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
  margin: 0;
}

.timeline-meta {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
