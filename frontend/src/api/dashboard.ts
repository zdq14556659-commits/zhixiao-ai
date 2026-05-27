import request from './request'

export function getSummary() {
  return request({
    url: '/dashboard/summary',
    method: 'get',
  })
}

export function getFunnel() {
  return request({
    url: '/dashboard/funnel',
    method: 'get',
  })
}
