import request from './request'

export interface CreateUserData {
  username: string
  realName: string
  password?: string
  phone: string
  email: string
  jobTitle: string
  department: string
  roleIds: number[]
  status: number
}

export interface UpdateUserData extends Partial<CreateUserData> {
  id: number
}

export function getUsers(params?: any) {
  return request({
    url: '/users',
    method: 'get',
    params,
  })
}

export function createUser(data: CreateUserData) {
  return request({
    url: '/users',
    method: 'post',
    data,
  })
}

export function updateUser(data: UpdateUserData) {
  return request({
    url: `/users/${data.id}`,
    method: 'put',
    data,
  })
}

export function deleteUser(id: number) {
  return request({
    url: `/users/${id}`,
    method: 'delete',
  })
}
