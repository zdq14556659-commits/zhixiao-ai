<template>
  <div class="app-wrapper">
    <Sidebar />
    <div class="main-container" :class="{ collapsed: appStore.sidebarCollapsed }">
      <NavHeader />
      <div class="app-main">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Sidebar from '@/components/common/Sidebar.vue'
import NavHeader from '@/components/common/NavHeader.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
</script>

<style scoped>
.app-wrapper {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-left: 220px;
  transition: margin-left 0.3s;
  background: #f0f2f5;
}

.main-container.collapsed {
  margin-left: 64px;
}

.app-main {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}
</style>
