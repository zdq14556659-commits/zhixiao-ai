import request from './request'

export interface LoginData {
  username: string
  password: string
}

export interface RegisterData {
  username: string
  password: string
  realName: string
}

export function login(data: LoginData) {
  return request({
    url: '/auth/login',
    method: 'post',
    data,
  })
}

export function register(data: RegisterData) {
  return request({
    url: '/auth/register',
    method: 'post',
    data,
  })
}

export function getUserInfo() {
  return request({
    url: '/auth/userinfo',
    method: 'get',
  })
}

export function logout() {
  return request({
    url: '/auth/logout',
    method: 'post',
  })
}
