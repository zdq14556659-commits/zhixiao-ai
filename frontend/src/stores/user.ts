import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as loginApi, getUserInfo } from '@/api/auth'
import type { LoginData } from '@/api/auth'
import router from '@/router'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '')
  const userInfo = ref<any>(null)
  const permissions = ref<string[]>([])

  const isLoggedIn = computed(() => !!token.value)
  const userName = computed(() => userInfo.value?.realName || userInfo.value?.username || '')
  const userAvatar = computed(() => userInfo.value?.avatar || '')

  async function setToken(val: string) {
    token.value = val
    localStorage.setItem('token', val)
  }

  async function login(loginData: LoginData) {
    const res = await loginApi(loginData)
    if (res.data?.token) {
      await setToken(res.data.token)
      await fetchUserInfo()
    }
    return res
  }

  async function fetchUserInfo() {
    try {
      const res = await getUserInfo()
      userInfo.value = res.data
      permissions.value = res.data?.permissions || []
    } catch {
      // If API fails, use stored data
      const stored = localStorage.getItem('userInfo')
      if (stored) {
        userInfo.value = JSON.parse(stored)
      }
    }
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    permissions.value = []
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
    router.push('/login')
  }

  function hasPermission(perm: string) {
    if (!permissions.value.length) return true
    return permissions.value.includes(perm) || permissions.value.includes('*')
  }

  return {
    token,
    userInfo,
    permissions,
    isLoggedIn,
    userName,
    userAvatar,
    login,
    fetchUserInfo,
    logout,
    hasPermission,
    setToken,
  }
})
