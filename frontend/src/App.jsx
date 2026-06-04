/**
 * App.jsx — 밀로's 플레이어 (보안 + 랭킹 + 즐겨찾기)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import MarqueeText from './MarqueeText.jsx'
import { useFavorites } from './useFavorites.js'
import TopThree from './TopThree.jsx'
import CategoryRanking from './CategoryRanking.jsx'
import {
  searchYouTube,
  formatDuration,
  isYouTubeUrl,
  isPlaylistUrl,
  extractVideoId,
  thumbnailFromId,
} from './youtube.js'
import { resolveAudio, fetchPlaylist } from './api.js'
import './App.css'

const TAB = { SEARCH: 'search', QUEUE: 'queue', FAVORITES: 'favorites', RANKING: 'ranking' }
const REPEAT = { NONE: 0, ONE: 1, ALL: 2 }

export default function App() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isPlaylist, setIsPlaylist] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [queue, setQueue] = useState([])
  const [tab, setTab] = useState(TAB.SEARCH)
  const [currentTrack, setCurrent] = useState(null)
  const [repeat, setRepeat] = useState(REPEAT.NONE)
  const [shuffle, setShuffle] = useState(false)

  const [resolving, setResolving] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.1)

  const [bgThumb, setBgThumb] = useState('')
  const [bgThumbNext, setBgThumbNext] = useState('')

  const [selectedCategory, setSelectedCategory] = useState('All')
  const [categories, setCategories] = useState(['All', 'Music', 'Pop', 'Rock', 'Hip-Hop', 'Jazz', 'Classical'])

  const { favorites, addFavorite, removeFavorite, isFavorite } = useFavorites()

  const audioRef = useRef(null)
  const dragIdx = useRef(null)
  // 자동재생 가드: 첫 곡을 막 시작했는지 추적 (state 비동기 race 방지)
  const startingRef = useRef(false)
  const retryingRef = useRef(false)

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories')
      if (response.ok) {
        const data = await response.json()
        const filtered = data.categories.filter(cat => {
          const valid = ['All', 'Music', 'Pop', 'Rock', 'Hip-Hop', 'Jazz', 'Classical', 'Uncategorized']
          return valid.includes(cat) || (cat && cat.length > 0 && !cat.includes('pvp'))
        })
        setCategories(filtered.length > 0 ? filtered : ['All'])
      }
    } catch (err) {
      console.error('카테고리 로드 실패:', err)
    }
  }

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => setCurrentTime(Math.floor(audio.currentTime))
    const onDuration = () => setDuration(Math.floor(audio.duration) || 0)
    const onPlay = () => { setPlaying(true); retryingRef.current = false }
    const onPause = () => setPlaying(false)
    const onEnded = () => handleTrackEnd()
    const onError = () => {
      // URL 만료(시간 지나 fetch 실패) 등 → 같은 곡을 fresh URL로 1회 재시도
      if (currentTrack && !retryingRef.current) {
        retryingRef.current = true
        setError('재생 링크를 새로 받아오는 중...')
        setTimeout(() => setError(''), 2500)
        playTrack(currentTrack)   // playTrack은 항상 새로 resolve → 새 스트림 URL
        return
      }
      // 재시도도 실패 → 다음 곡으로
      retryingRef.current = false
      setError('재생 오류. 다음 곡으로 넘어갑니다.')
      setTimeout(() => setError(''), 3000)
      handleTrackEnd()
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('durationchange', onDuration)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    // 잠금화면/알림 미디어 컨트롤 → 백그라운드에서도 동작
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => { audio.play().catch(() => {}) })
      navigator.mediaSession.setActionHandler('pause', () => { audio.pause() })
      navigator.mediaSession.setActionHandler('nexttrack', () => { handleTrackEnd() })
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (audio.currentTime > 3) { audio.currentTime = 0 } else { audio.currentTime = 0 }
      })
    }

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('durationchange', onDuration)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [queue, repeat, shuffle, currentTrack])

  // 잠깐 뜨는 안내 메시지
  const showNotice = useCallback((msg) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 2500)
  }, [])

  const handleTrackEnd = useCallback(() => {
    setQueue((prev) => {
      if (repeat === REPEAT.ONE && currentTrack) {
        playTrack(currentTrack)
        return prev
      }
      if (repeat === REPEAT.ALL && currentTrack) {
        const next = [...prev, currentTrack]
        const [first, ...rest] = next
        playTrack(first)
        return rest
      }
      if (prev.length === 0) {
        setCurrent(null)
        return prev
      }
      const [next, ...rest] = prev
      playTrack(next)
      return rest
    })
  }, [repeat, currentTrack])

  const playTrack = async (track) => {
    if (!track || !track.url) return

    setResolving(true)
    try {
      const data = await resolveAudio(track.url)
      const newTrack = {
        ...track,
        streamUrl: data.url,
        title: data.title,
        duration: data.duration,
        thumbnail: data.thumbnail,
        uploader: track.uploader || data.uploader,
      }
      setCurrent(newTrack)

      setBgThumbNext(data.thumbnail)
      setTimeout(() => {
        setBgThumb(data.thumbnail)
        setBgThumbNext('')
      }, 600)

      audioRef.current.src = data.url
      const playPromise = audioRef.current.play()
      if (playPromise && playPromise.catch) {
        playPromise.catch(() => {})
      }

      // OS 잠금화면/알림 미디어 컨트롤 연동 (백그라운드 연속재생 안정화)
      if ('mediaSession' in navigator) {
        try {
          const validTitle = (newTrack.title && /[A-Za-z0-9가-힣ぁ-んァ-ヶ一-鿿]/.test(newTrack.title))
            ? newTrack.title : '재생 중'
          navigator.mediaSession.metadata = new window.MediaMetadata({
            title: validTitle,
            artist: newTrack.uploader || '',
            album: "밀로's 플레이어",
            artwork: newTrack.thumbnail
              ? [{ src: newTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
              : [],
          })
          navigator.mediaSession.playbackState = 'playing'
        } catch (e) { /* 무시 */ }
      }
    } catch (err) {
      retryingRef.current = false
      setError(`재생 실패: ${err.message}`)
      setTimeout(() => handleTrackEnd(), 2000)
    } finally {
      setResolving(false)
      startingRef.current = false
    }
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    if (isYouTubeUrl(query)) {
      if (isPlaylistUrl(query)) {
        setIsPlaylist(true)
        await loadPlaylist(query)
      } else {
        // 단일 URL: 검색 결과처럼 1곡 표시 → ▶/➕ 선택 가능
        const id = extractVideoId(query)
        setResults([{
          url: query,
          title: 'YouTube 영상',
          uploader: 'YouTube',
          thumbnail: id ? thumbnailFromId(id) : '',
          videoId: id,
        }])
      }
      setQuery('')
      return
    }

    setSearching(true)
    setSearchErr('')
    try {
      const res = await searchYouTube(query)
      setResults(res)
    } catch (err) {
      setSearchErr('검색 실패')
    } finally {
      setSearching(false)
    }
  }

  const loadPlaylist = async (url) => {
    setSearching(true)
    try {
      const tracks = await fetchPlaylist(url)
      // 핵심 룰: 대기열에 곡이 들어오면 무조건 첫 곡부터 자동재생
      enqueueMany(tracks)
    } catch (err) {
      setSearchErr('재생목록 로드 실패')
    } finally {
      setSearching(false)
    }
  }

  /**
   * 핵심 룰 — 단일 곡을 대기열에 추가.
   * 재생 중인 곡이 없으면(첫 곡이면) 즉시 자동재생.
   */
  const addToQueue = useCallback((track) => {
    if (!track || !track.url) return

    if (!currentTrack && !startingRef.current) {
      // 첫 곡 → 바로 재생 (재생 중인 곡은 큐 밖에서 관리)
      startingRef.current = true
      playTrack(track)
      return
    }
    setQueue((prev) => [...prev, track])
  }, [currentTrack])

  /**
   * 핵심 룰 — 여러 곡을 한 번에 대기열에 추가 (즐겨찾기 일괄추가/재생목록).
   * 재생 중인 곡이 없으면 첫 곡 자동재생 + 나머지는 대기열로.
   */
  const enqueueMany = useCallback((tracks) => {
    const list = (tracks || []).filter((t) => t && t.url)
    if (list.length === 0) return

    if (!currentTrack && !startingRef.current) {
      startingRef.current = true
      const [first, ...rest] = list
      if (rest.length > 0) setQueue((prev) => [...prev, ...rest])
      playTrack(first)
    } else {
      setQueue((prev) => [...prev, ...list])
    }
  }, [currentTrack])

  const addAllFavoritesToQueue = useCallback(() => {
    if (favorites.length === 0) {
      showNotice('즐겨찾기가 비어 있습니다')
      return
    }
    enqueueMany(favorites)
    showNotice(`즐겨찾기 ${favorites.length}곡을 대기열에 추가했습니다`)
  }, [favorites, enqueueMany, showNotice])

  const removeFromQueue = (idx) => {
    setQueue((prev) => prev.filter((_, i) => i !== idx))
  }

  // 곡이 없을 때 컨트롤 가드
  const guardNoTrack = () => {
    if (!currentTrack) {
      showNotice('곡을 재생해주세요')
      return true
    }
    return false
  }

  const handleShuffle = () => {
    if (guardNoTrack()) return
    setShuffle(!shuffle)
    setQueue((prev) => {
      const shuffled = [...prev]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return shuffled
    })
  }

  const noTrack = !currentTrack

  return (
    <div className={`app ${bgThumb ? 'has-bg' : ''}`} style={{ backgroundImage: bgThumb ? `url(${bgThumb})` : 'none' }}>
      {bgThumbNext && (
        <div
          className="app-bg-transition"
          style={{ backgroundImage: `url(${bgThumbNext})` }}
        />
      )}
      <div className="app-overlay">
        <div className="header">
          <h1>♬ 밀로's 플레이어</h1>
          <p>YouTube 기반 웹 뮤직 플레이어</p>
        </div>

        <div className="player-container">
          <div className="player">
            {currentTrack && currentTrack.thumbnail && (
              <img
                src={currentTrack.thumbnail}
                alt="현재곡"
                className="now-playing-thumb"
              />
            )}

            {currentTrack ? (
              <div className="now-playing">
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'}}>
                  <MarqueeText text={(currentTrack.title && /[A-Za-z0-9가-힣ぁ-んァ-ヶ一-鿿]/.test(currentTrack.title)) ? currentTrack.title : (currentTrack.url || '제목 없음')} />
                </div>
                <p className="uploader">{currentTrack.uploader}</p>
              </div>
            ) : (
              <div className="now-playing">곡을 선택하세요</div>
            )}

            <div className="time-display">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </div>

            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              disabled={noTrack}
              onChange={(e) => {
                if (!audioRef.current) return
                audioRef.current.currentTime = parseFloat(e.target.value)
              }}
              className="progress-bar"
            />

            <div className="controls">
              <button onClick={handleShuffle} disabled={noTrack}>
                🔀 {shuffle ? '셔플 ON' : '셔플 OFF'}
              </button>
              <button
                onClick={() => { if (guardNoTrack()) return; audioRef.current?.pause() }}
                disabled={noTrack}
              >
                ⏮ 이전
              </button>
              <button
                onClick={() => {
                  if (guardNoTrack()) return
                  playing ? audioRef.current?.pause() : audioRef.current?.play()
                }}
                className="play-btn"
                disabled={noTrack}
              >
                {playing ? '⏸ 일시중지' : '▶ 재생'}
              </button>
              <button onClick={() => { if (guardNoTrack()) return; handleTrackEnd() }} disabled={noTrack}>
                다음 ⏭
              </button>
              <button
                onClick={() => { if (guardNoTrack()) return; setRepeat((repeat + 1) % 3) }}
                disabled={noTrack}
              >
                🔁{' '}
                {repeat === REPEAT.NONE
                  ? '반복 안함'
                  : repeat === REPEAT.ONE
                    ? '1곡 반복'
                    : '전체 반복'}
              </button>
            </div>

            <div className="volume-control">
              <label>🔊</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="volume-slider"
              />
              <span>{Math.round(volume * 100)}%</span>
              <button
                className="fav-toggle-btn"
                onClick={() => { if (guardNoTrack()) return; isFavorite(currentTrack.url) ? removeFavorite(currentTrack.url) : addFavorite(currentTrack) }}
                disabled={noTrack}
                title={currentTrack && isFavorite(currentTrack.url) ? '즐겨찾기 제거' : '즐겨찾기 추가'}
              >
                {currentTrack && isFavorite(currentTrack.url) ? '❤️' : '🤍'}
              </button>
            </div>

            {notice && <div className="notice-message">{notice}</div>}
            {error && <div className="error-message">{error}</div>}
          </div>

          <audio ref={audioRef} crossOrigin="anonymous" playsInline preload="auto" />


          <div className="tab-navigation">
            <button
              className={`tab-btn ${tab === TAB.RANKING ? 'active' : ''}`}
              onClick={() => setTab(TAB.RANKING)}
            >
              🎵 랭킹
            </button>
            <button
              className={`tab-btn ${tab === TAB.SEARCH ? 'active' : ''}`}
              onClick={() => setTab(TAB.SEARCH)}
            >
              🔍 검색
            </button>
            <button
              className={`tab-btn ${tab === TAB.QUEUE ? 'active' : ''}`}
              onClick={() => setTab(TAB.QUEUE)}
            >
              📋 대기곡 ({queue.length})
            </button>
            <button
              className={`tab-btn ${tab === TAB.FAVORITES ? 'active' : ''}`}
              onClick={() => setTab(TAB.FAVORITES)}
            >
              ❤️ 즐겨찾기 ({favorites.length})
            </button>
          </div>

          {tab === TAB.RANKING && (
            <div className="content-section ranking-section">
              <div className="category-tabs">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    className={`category-tab ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <TopThree
                onPlayTrack={addToQueue}
                onAddQueue={addToQueue}
                selectedCategory={selectedCategory}
              />

              <CategoryRanking
                selectedCategory={selectedCategory}
                onPlayTrack={addToQueue}
                onAddQueue={addToQueue}
              />
            </div>
          )}

          {tab === TAB.SEARCH && (
            <div className="content-section">
              <form onSubmit={handleSearch}>
                <input
                  type="text"
                  placeholder="곡 검색 또는 YouTube URL 입력..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="search-input"
                />
                <button type="submit" disabled={searching}>
                  {searching ? '검색 중...' : '검색'}
                </button>
              </form>

              {searchErr && <p className="error">{searchErr}</p>}

              <div className="results">
                {results.map((track, idx) => (
                  <div key={idx} className="result-item">
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="thumb"
                    />
                    <div className="info">
                      <h4>{track.title}</h4>
                      <p>{track.uploader}</p>
                    </div>
                    <div className="actions">
                      <button
                        className="fav-btn"
                        onClick={() => isFavorite(track.url) ? removeFavorite(track.url) : addFavorite(track)}
                        title={isFavorite(track.url) ? '즐겨찾기 제거' : '즐겨찾기 추가'}
                      >
                        {isFavorite(track.url) ? '❤️' : '🤍'}
                      </button>
                      <button
                        className="queue-add-btn"
                        onClick={() => addToQueue(track)}
                        title="대기열에 추가"
                      >
                        ➕
                      </button>
                      <button
                        onClick={() => addToQueue(track)}
                        title="재생"
                      >
                        ▶ 재생
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === TAB.QUEUE && (
            <div className="content-section">
              <h3>대기곡 ({queue.length})</h3>
              <div className="queue-list">
                {queue.map((track, idx) => (
                  <div
                    key={idx}
                    className="queue-item"
                    draggable
                    onDragStart={() => (dragIdx.current = idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      const newQueue = [...queue]
                      const temp = newQueue[dragIdx.current]
                      newQueue[dragIdx.current] = newQueue[idx]
                      newQueue[idx] = temp
                      setQueue(newQueue)
                    }}
                  >
                    <span className="index">{idx + 1}</span>
                    {track.thumbnail && (
                      <img src={track.thumbnail} alt="" className="queue-thumb" loading="lazy" />
                    )}
                    <div className="track-info">
                      <a className="title" href={track.url} target="_blank" rel="noopener noreferrer">{(track.title && /[A-Za-z0-9가-힣ぁ-んァ-ヶ一-鿿]/.test(track.title)) ? track.title : (track.url || '제목 없음')}</a>
                      <p className="uploader">{track.uploader}</p>
                    </div>
                    <button onClick={() => playTrack(track)} title="재생">▶️</button>
                    <button onClick={() => isFavorite(track.url) ? removeFavorite(track.url) : addFavorite(track)} title="즐겨찾기">{isFavorite(track.url) ? '❤️' : '🤍'}</button>
                    <button onClick={() => removeFromQueue(idx)} title="제거">❌</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === TAB.FAVORITES && (
            <div className="content-section">
              <div className="favorites-header">
                <h3>즐겨찾기 ({favorites.length})</h3>
                <button
                  className="add-all-btn"
                  onClick={addAllFavoritesToQueue}
                  disabled={favorites.length === 0}
                  title="즐겨찾기 전체를 대기열에 추가"
                >
                  ➕ 전체 대기열 추가
                </button>
              </div>
              <div className="queue-list">
                {favorites.map((track, idx) => (
                  <div key={idx} className="queue-item favorite-item">
                    <span className="index fav-badge">❤️</span>
                    {track.thumbnail && (
                      <img src={track.thumbnail} alt="" className="queue-thumb" loading="lazy" />
                    )}
                    <div className="track-info">
                      <a className="title" href={track.url} target="_blank" rel="noopener noreferrer">{(track.title && /[A-Za-z0-9가-힣ぁ-んァ-ヶ一-鿿]/.test(track.title)) ? track.title : (track.url || '제목 없음')}</a>
                      <p className="uploader">{track.uploader}</p>
                    </div>
                    <button onClick={() => addToQueue(track)} title="재생">▶️</button>
                    <button onClick={() => addToQueue(track)} title="대기열에 추가">➕</button>
                    <button onClick={() => removeFavorite(track.url)} title="제거">❌</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="app-footer">
          <h4>🔗 사용 기술</h4>
          <span>
            <a href="https://developers.google.com/youtube/v3" target="_blank" rel="noopener noreferrer">YouTube API</a>
            <a href="https://github.com/yt-dlp/yt-dlp" target="_blank" rel="noopener noreferrer">yt-dlp</a>
            <a href="https://fastapi.tiangolo.com/" target="_blank" rel="noopener noreferrer">FastAPI</a>
            <a href="https://react.dev/" target="_blank" rel="noopener noreferrer">React</a>
            <a href="https://vitejs.dev/" target="_blank" rel="noopener noreferrer">Vite</a>
          </span>
          <p style={{marginTop: '10px'}}>밀로's 플레이어 v1.0 | © 2024</p>
        </footer>
      </div>
    </div>
  )
}
