import request from './request'

export interface CreateOpportunityData {
  name: string
  customer_id: number
  customer_name: string
  amount: number
  probability: number
  stage: string
  owner_id: number
  expected_close_date: string
}

export function getOpportunities(params?: any) {
  return request({
    url: '/sales/opportunities',
    method: 'get',
    params,
  })
}

export function createOpportunity(data: CreateOpportunityData) {
  return request({
    url: '/sales/opportunities',
    method: 'post',
    data,
  })
}

export function updateOpportunityStage(id: number, stage: string) {
  return request({
    url: `/sales/opportunities/${id}/stage`,
    method: 'put',
    data: { stage },
  })
}

export function getOrders(params?: any) {
  return request({
    url: '/sales/orders',
    method: 'get',
    params,
  })
}
