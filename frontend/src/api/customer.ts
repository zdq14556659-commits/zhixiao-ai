import request from './request'

export interface CreateCustomerData {
  name: string
  industry: string
  source: string
  phone: string
  address: string
  stage: string
  intention_level: number
  owner_id?: number
}

export interface UpdateCustomerData extends Partial<CreateCustomerData> {
  id: number
}

export interface CreateClueData {
  customer_name: string
  contact: string
  phone: string
  source: string
  status: string
}

export function getCustomers(params?: any) {
  return request({
    url: '/customers',
    method: 'get',
    params,
  })
}

export function getCustomerDetail(id: number) {
  return request({
    url: `/customers/${id}/detail`,
    method: 'get',
  })
}

export function createCustomer(data: CreateCustomerData) {
  return request({
    url: '/customers',
    method: 'post',
    data,
  })
}

export function updateCustomer(data: UpdateCustomerData) {
  return request({
    url: `/customers/${data.id}`,
    method: 'put',
    data,
  })
}

export function deleteCustomer(id: number) {
  return request({
    url: `/customers/${id}`,
    method: 'delete',
  })
}

export function getClues(params?: any) {
  return request({
    url: '/customers/clues',
    method: 'get',
    params,
  })
}

export function createClue(data: CreateClueData) {
  return request({
    url: '/customers/clues',
    method: 'post',
    data,
  })
}
