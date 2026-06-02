/**
 * api.js — FastAPI 백엔드 래퍼
 */

const API_BASE = '/api'

export async function resolveAudio(url) {
  const response = await fetch(`${API_BASE}/resolve?url=${encodeURIComponent(url)}`)
  if (!response.ok) {
    throw new Error(`Failed to resolve audio: ${response.statusText}`)
  }
  return response.json()
}

export async function fetchPlaylist(url) {
  const response = await fetch(`${API_BASE}/playlist?url=${encodeURIComponent(url)}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch playlist: ${response.statusText}`)
  }
  const data = await response.json()
  return data.tracks
}

export async function fetchRankingTop(limit = 3, category = 'All') {
  const response = await fetch(
    `${API_BASE}/ranking/top?limit=${limit}&category=${category}`
  )
  if (!response.ok) {
    throw new Error('Failed to fetch ranking')
  }
  return response.json()
}

export async function fetchRankingPage(page = 1, pageSize = 10, category = 'All') {
  const response = await fetch(
    `${API_BASE}/ranking/page?page=${page}&page_size=${pageSize}&category=${category}`
  )
  if (!response.ok) {
    throw new Error('Failed to fetch ranking page')
  }
  return response.json()
}

export async function fetchCategories() {
  const response = await fetch(`${API_BASE}/categories`)
  if (!response.ok) {
    throw new Error('Failed to fetch categories')
  }
  return response.json()
}

export async function checkHealth() {
  const response = await fetch(`${API_BASE}/health`)
  if (!response.ok) {
    throw new Error('Health check failed')
  }
  return response.json()
}
