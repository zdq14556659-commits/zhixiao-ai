<template>
  <div class="order-page">
    <!-- Filter -->
    <div class="filter-card">
      <el-form :model="filterForm" inline>
        <el-form-item label="订单状态">
          <el-select v-model="filterForm.status" placeholder="全部" clearable style="width: 130px">
            <el-option label="待审核" value="待审核" />
            <el-option label="已确认" value="已确认" />
            <el-option label="执行中" value="执行中" />
            <el-option label="已完成" value="已完成" />
            <el-option label="已取消" value="已取消" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="filterForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 240px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchData">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- Table -->
    <div class="table-card" v-loading="loading">
      <el-table :data="orderList" border stripe style="width: 100%">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="orderNo" label="订单编号" min-width="160" />
        <el-table-column prop="customer" label="客户名称" min-width="140" />
        <el-table-column prop="amount" label="订单金额" width="130">
          <template #default="{ row }">¥{{ row.amount.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="owner" label="负责人" width="80" />
        <el-table-column prop="signDate" label="签约日期" width="110" />
        <el-table-column prop="deliveryDate" label="交付日期" width="110" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button type="primary" link size="small">详情</el-button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import dayjs from 'dayjs'

const loading = ref(false)
const orderList = ref<any[]>([])

const filterForm = reactive({
  status: '',
  dateRange: null as string[] | null,
})

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
})

function statusTagType(status: string) {
  const map: Record<string, string> = {
    待审核: 'info',
    已确认: 'primary',
    执行中: 'warning',
    已完成: 'success',
    已取消: 'danger',
  }
  return map[status] || 'info'
}

function fetchData() {
  loading.value = true
  setTimeout(() => {
    const list = []
    for (let i = 0; i < pagination.pageSize; i++) {
      const index = (pagination.current - 1) * pagination.pageSize + i + 1
      if (index > 45) break
      list.push({
        id: index,
        orderNo: `ORD-${dayjs().format('YYYYMMDD')}-${String(index).padStart(4, '0')}`,
        customer: `客户${String(index).padStart(4, '0')}`,
        amount: Math.floor(Math.random() * 500000) + 10000,
        status: ['待审核', '已确认', '执行中', '已完成', '已取消'][index % 5],
        owner: ['张三', '李四', '王五'][index % 3],
        signDate: dayjs().subtract(index * 2, 'day').format('YYYY-MM-DD'),
        deliveryDate: dayjs().add(index * 3, 'day').format('YYYY-MM-DD'),
      })
    }
    orderList.value = list
    pagination.total = 45
    loading.value = false
  }, 300)
}

function handleReset() {
  filterForm.status = ''
  filterForm.dateRange = null
  fetchData()
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
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

.pagination-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
