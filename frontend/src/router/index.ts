import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '工作台', icon: 'Odometer' },
      },
      {
        path: 'dashboard/ceo',
        name: 'DashboardCeo',
        component: () => import('@/views/dashboard/ceo/index.vue'),
        meta: { title: 'CEO管理看板', icon: 'DataBoard' },
      },
      {
        path: 'customer/list',
        name: 'CustomerList',
        component: () => import('@/views/customer/index.vue'),
        meta: { title: '客户列表', icon: 'User' },
      },
      {
        path: 'customer/clue',
        name: 'CustomerClue',
        component: () => import('@/views/customer/clue.vue'),
        meta: { title: '线索管理', icon: 'TrendCharts' },
      },
      {
        path: 'customer/detail/:id',
        name: 'CustomerDetail',
        component: () => import('@/views/customer/detail.vue'),
        meta: { title: '客户详情', hidden: true },
      },
      {
        path: 'sales/opportunity',
        name: 'SalesOpportunity',
        component: () => import('@/views/sales/opportunity.vue'),
        meta: { title: '商机管理', icon: 'Money' },
      },
      {
        path: 'sales/order',
        name: 'SalesOrder',
        component: () => import('@/views/sales/order.vue'),
        meta: { title: '订单管理', icon: 'Document' },
      },
      {
        path: 'recording/list',
        name: 'RecordingList',
        component: () => import('@/views/recording/index.vue'),
        meta: { title: '录音管理', icon: 'Microphone' },
      },
      {
        path: 'recording/transcription',
        name: 'RecordingTranscription',
        component: () => import('@/views/transcription/index.vue'),
        meta: { title: '转写分析', icon: 'Notebook' },
      },
      {
        path: 'ai/dashboard',
        name: 'AIDashboard',
        component: () => import('@/views/ai/dashboard.vue'),
        meta: { title: 'AI分析看板', icon: 'DataAnalysis' },
      },
      {
        path: 'system/user',
        name: 'SystemUser',
        component: () => import('@/views/system/user.vue'),
        meta: { title: '用户管理', icon: 'UserFilled' },
      },
      {
        path: 'system/role',
        name: 'SystemRole',
        component: () => import('@/views/system/role.vue'),
        meta: { title: '角色管理', icon: 'Avatar' },
      },
      {
        path: 'system/knowledge',
        name: 'SystemKnowledge',
        component: () => import('@/views/system/knowledge.vue'),
        meta: { title: '知识库', icon: 'Reading' },
      },
      {
        path: 'system/resignation',
        name: 'SystemResignation',
        component: () => import('@/views/system/resignation/index.vue'),
        meta: { title: '离职交接', icon: 'Switch' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  const userStore = useUserStore()
  if (to.meta.requiresAuth !== false && !userStore.token) {
    next('/login')
  } else if (to.path === '/login' && userStore.token) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
