/**
 * Top 3 랭킹 (홈 상단)
 * 가장 많이 재생된 3곡 + 클릭 시 재생
 */

import React, { useState, useEffect } from 'react'
import './TopThree.css'

export default function TopThree({ onPlayTrack, onAddQueue, selectedCategory }) {
  const [topTracks, setTopTracks] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchTopTracks()
  }, [selectedCategory])

  const fetchTopTracks = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/ranking/top?limit=3&category=${selectedCategory || 'All'}`
      )
      if (response.ok) {
        const data = await response.json()
        setTopTracks(data.items)
      }
    } catch (err) {
      console.error('Top 3 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="top-three loading">로드 중...</div>

  return (
    <div className="top-three">
      <h2>🔥 인기 곡 (Top 3)</h2>
      <div className="top-three-container">
        {topTracks.map((track) => (
          <div
            key={track.video_id}
            className={`top-three-card rank-${track.rank}`}
            onClick={() => onPlayTrack({ url: track.url, title: track.title, thumbnail: track.thumbnail, uploader: track.uploader })}
          >
            {/* 순위 배지 */}
            <div className="rank-badge">
              {track.rank === 1 && '🥇'}
              {track.rank === 2 && '🥈'}
              {track.rank === 3 && '🥉'}
              <span>{track.rank}</span>
            </div>

            {/* 썸네일 */}
            <img
              src={track.thumbnail}
              alt={track.title}
              className="thumbnail"
            />

            {/* 정보 */}
            <div className="track-info">
              <a
                href={track.url}
                target="_blank"
                rel="noopener noreferrer"
                className="track-title"
                title={track.title || '제목 없음'}
              >
                {(track.title && /[A-Za-z0-9가-힣ぁ-んァ-ヶ一-鿿]/.test(track.title)) ? track.title : (track.url || '제목 없음')}
              </a>
              <p className="uploader">{track.uploader}</p>
              <p className="play-count">재생: {track.play_count}회</p>
              <span className="category-tag">{track.category}</span>
            </div>

            {/* 호버 오버레이 */}
            <div className="overlay">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onPlayTrack({ url: track.url, title: track.title, thumbnail: track.thumbnail, uploader: track.uploader })
                }}
              >▶ 재생</button>
              <button
                className="overlay-add"
                onClick={(e) => {
                  e.stopPropagation()
                  ;(onAddQueue || onPlayTrack)({ url: track.url, title: track.title, thumbnail: track.thumbnail, uploader: track.uploader })
                }}
              >➕ 추가</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
