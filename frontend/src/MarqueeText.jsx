/**
 * MarqueeText.jsx — 흐르는 텍스트 컴포넌트
 */

import React, { useState, useRef, useEffect } from 'react'
import './MarqueeText.css'

export default function MarqueeText({ text }) {
  const [isOverflow, setIsOverflow] = useState(false)
  const containerRef = useRef(null)
  const textRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    const textEl = textRef.current

    if (!container || !textEl) return

    // 텍스트가 컨테이너를 초과하는지 확인
    const isOverflowing = textEl.scrollWidth > container.clientWidth
    setIsOverflow(isOverflowing)
  }, [text])

  return (
    <div className={`marquee ${isOverflow ? 'overflow' : ''}`} ref={containerRef}>
      <span ref={textRef}>{text}</span>
      {isOverflow && <span className="marquee-clone">{text}</span>}
    </div>
  )
}
