/**
 * useFavorites.js — 즐겨찾기 관리 (로컬스토리지)
 */

import { useState, useEffect } from 'react'

export function useFavorites() {
  const [favorites, setFavorites] = useState([])

  // 로컬스토리지에서 로드
  useEffect(() => {
    const saved = localStorage.getItem('favorites')
    if (saved) {
      try {
        setFavorites(JSON.parse(saved))
      } catch (err) {
        console.error('즐겨찾기 로드 실패:', err)
        setFavorites([])
      }
    }
  }, [])

  // 로컬스토리지에 저장
  const save = (newFavorites) => {
    localStorage.setItem('favorites', JSON.stringify(newFavorites))
    setFavorites(newFavorites)
  }

  const addFavorite = (track) => {
    const isDuplicate = favorites.some((fav) => fav.url === track.url)
    if (!isDuplicate) {
      save([...favorites, track])
    }
  }

  const removeFavorite = (url) => {
    save(favorites.filter((fav) => fav.url !== url))
  }

  const isFavorite = (url) => {
    return favorites.some((fav) => fav.url === url)
  }

  return { favorites, addFavorite, removeFavorite, isFavorite }
}
