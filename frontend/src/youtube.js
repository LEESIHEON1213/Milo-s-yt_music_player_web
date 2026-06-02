/**
 * youtube.js — YouTube 관련 유틸리티
 */

const YOUTUBE_API_KEY = import.meta.env.VITE_YT_API_KEY

// YouTube URL 검증
export function isYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?youtube\.com|youtu\.be/.test(url)
}

export function isPlaylistUrl(url) {
  return /[?&]list=/.test(url) || /youtube\.com\/playlist/.test(url)
}

export function extractVideoId(url) {
  const match = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/)
  return match ? match[1] : null
}

export function thumbnailFromId(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
}

export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

// YouTube 데이터 API v3를 통한 검색
export async function searchYouTube(query) {
  if (!YOUTUBE_API_KEY) {
    console.warn('VITE_YT_API_KEY 환경변수 필요')
    return []
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet&q=${encodeURIComponent(query)}&` +
      `maxResults=20&type=video&key=${YOUTUBE_API_KEY}`
    )

    if (!response.ok) {
      throw new Error('YouTube API 호출 실패')
    }

    const data = await response.json()

    return data.items.map((item) => {
      const videoId = item.id.videoId
      return {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium.url,
        uploader: item.snippet.channelTitle,
        videoId,
      }
    })
  } catch (err) {
    console.error('검색 오류:', err)
    return []
  }
}
