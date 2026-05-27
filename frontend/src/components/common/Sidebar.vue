<template>
  <div class="sidebar" :class="{ collapsed: appStore.sidebarCollapsed }">
    <div class="sidebar-logo">
      <el-icon :size="28" color="#409EFF"><Odometer /></el-icon>
      <span class="logo-text" v-show="!appStore.sidebarCollapsed">智销AI</span>
    </div>
    <el-menu
      :default-active="activeMenu"
      :collapse="appStore.sidebarCollapsed"
      :collapse-transition="false"
      background-color="#1f2d3d"
      text-color="#bfcbd9"
      active-text-color="#409EFF"
      router
    >
      <el-menu-item index="/dashboard">
        <el-icon><Odometer /></el-icon>
        <template #title>工作台</template>
      </el-menu-item>

      <el-menu-item index="/dashboard/ceo">
        <el-icon><DataBoard /></el-icon>
        <template #title>CEO看板</template>
      </el-menu-item>

      <el-sub-menu index="customer">
        <template #title>
          <el-icon><User /></el-icon>
          <span>客户管理</span>
        </template>
        <el-menu-item index="/customer/list">客户列表</el-menu-item>
        <el-menu-item index="/customer/clue">线索管理</el-menu-item>
      </el-sub-menu>

      <el-sub-menu index="sales">
        <template #title>
          <el-icon><Money /></el-icon>
          <span>销售管理</span>
        </template>
        <el-menu-item index="/sales/opportunity">商机管理</el-menu-item>
        <el-menu-item index="/sales/order">订单管理</el-menu-item>
      </el-sub-menu>

      <el-sub-menu index="recording">
        <template #title>
          <el-icon><Microphone /></el-icon>
          <span>录音管理</span>
        </template>
        <el-menu-item index="/recording/list">录音列表</el-menu-item>
        <el-menu-item index="/recording/transcription">转写分析</el-menu-item>
      </el-sub-menu>

      <el-menu-item index="/ai/dashboard">
        <el-icon><DataAnalysis /></el-icon>
        <template #title>AI分析看板</template>
      </el-menu-item>

      <el-sub-menu index="system">
        <template #title>
          <el-icon><Setting /></el-icon>
          <span>系统管理</span>
        </template>
        <el-menu-item index="/system/user">用户管理</el-menu-item>
        <el-menu-item index="/system/role">角色管理</el-menu-item>
        <el-menu-item index="/system/knowledge">
          <el-icon><Reading /></el-icon>
          知识库
        </el-menu-item>
        <el-menu-item index="/system/resignation">
          <el-icon><Switch /></el-icon>
          离职交接
        </el-menu-item>
      </el-sub-menu>
    </el-menu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()

const activeMenu = computed(() => {
  const { path } = route
  return path
})
</script>

<style scoped>
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 220px;
  background: #1f2d3d;
  z-index: 1001;
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 0.3s;
}

.sidebar.collapsed {
  width: 64px;
}

.sidebar::-webkit-scrollbar {
  width: 4px;
}

.sidebar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.sidebar-logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.logo-text {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  margin-left: 10px;
  white-space: nowrap;
}

.el-menu {
  border-right: none;
}
</style>
