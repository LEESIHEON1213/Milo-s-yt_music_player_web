/**
 * 카테고리별 랭킹 보드 (Top 100, 페이지네이션)
 */

import React, { useState, useEffect } from 'react'
import './CategoryRanking.css'

export default function CategoryRanking({ selectedCategory, onPlayTrack, onAddQueue }) {
  const [ranking, setRanking] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)

  const PAGE_SIZE = 10

  useEffect(() => {
    fetchRanking(1)
  }, [selectedCategory])

  const fetchRanking = async (pageNum) => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/ranking/page?page=${pageNum}&page_size=${PAGE_SIZE}&category=${selectedCategory || 'All'}`
      )
      if (response.ok) {
        const data = await response.json()
        setRanking(data.items)
        setPage(data.page)
        setTotalPages(data.total_pages)
        setTotal(data.total)
      }
    } catch (err) {
      console.error('랭킹 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchRanking(newPage)
      window.scrollTo(0, 0)
    }
  }

  if (loading && ranking.length === 0) {
    return <div className="ranking-board loading">로드 중...</div>
  }

  return (
    <div className="ranking-board">
      <h2>📊 {selectedCategory} 랭킹 (상위 {Math.min(total, 100)}곡)</h2>

      {ranking.length === 0 ? (
        <div className="no-data">
          🎵 아직 '{selectedCategory}' 카테고리의 데이터가 없습니다<br/>
          <small style={{opacity: 0.7}}>곡을 재생하면 자동으로 순위가 업데이트됩니다</small>
        </div>
      ) : (
        <>
          <div className="ranking-table">
            <div className="table-header">
              <div className="col-rank">순위</div>
              <div className="col-thumbnail"></div>
              <div className="col-info">제목 / 채널</div>
              <div className="col-plays">재생수</div>
              <div className="col-action">담기</div>
            </div>

            <div className="table-body">
              {ranking.map((track) => (
                <div key={track.video_id} className="table-row">
                  <div className="col-rank">
                    <span className={`rank-number rank-${Math.min(track.rank, 3)}`}>
                      {track.rank}
                    </span>
                  </div>

                  <div className="col-thumbnail">
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      loading="lazy"
                    />
                  </div>

                  <div className="col-info">
                    <a
                      href={track.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="title"
                      title={track.title || '제목 없음'}
                    >
                      {(track.title && /[A-Za-z0-9가-힣ぁ-んァ-ヶ一-鿿]/.test(track.title)) ? track.title : (track.url || '제목 없음')}
                    </a>
                    <div className="uploader" title={track.uploader}>
                      {track.uploader}
                      <span className="plays-inline">▶ {track.play_count}회</span>
                    </div>
                  </div>

                  <div className="col-plays">
                    <span className="play-badge">{track.play_count}</span>
                  </div>

                  <div className="col-action">
                    <button
                      className="play-btn"
                      onClick={() =>
                        onPlayTrack({ url: track.url, title: track.title, thumbnail: track.thumbnail, uploader: track.uploader })
                      }
                      title="재생"
                    >
                      ▶
                    </button>
                    <button
                      className="queue-btn"
                      onClick={() =>
                        (onAddQueue || onPlayTrack)({ url: track.url, title: track.title, thumbnail: track.thumbnail, uploader: track.uploader })
                      }
                      title="대기열에 추가"
                    >
                      ➕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 페이지네이션 */}
          <div className="pagination">
            <button
              onClick={() => handlePageChange(1)}
              disabled={page === 1}
              className="pagination-btn"
            >
              «
            </button>

            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
              className="pagination-btn"
            >
              ‹
            </button>

            <div className="page-info">
              페이지 {page} / {totalPages}
            </div>

            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages}
              className="pagination-btn"
            >
              ›
            </button>

            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={page === totalPages}
              className="pagination-btn"
            >
              »
            </button>
          </div>
        </>
      )}
    </div>
  )
}
