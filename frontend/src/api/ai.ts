import request from './request'

export function analyzeRecording(id: number) {
  return request({
    url: `/ai/analyze/${id}`,
    method: 'post',
  })
}

export function getAnalysis(id: number) {
  return request({
    url: `/ai/analysis/${id}`,
    method: 'get',
  })
}
