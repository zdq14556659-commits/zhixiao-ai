import request from './request'

export function getRecordings(params?: any) {
  return request({
    url: '/recordings',
    method: 'get',
    params,
  })
}

export function uploadRecording(data: FormData) {
  return request({
    url: '/recordings/upload',
    method: 'post',
    data,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function getTranscript(id: number) {
  return request({
    url: `/recordings/${id}/transcript`,
    method: 'get',
  })
}
