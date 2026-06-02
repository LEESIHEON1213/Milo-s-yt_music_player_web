/**
 * ApiInfo.jsx — API 출처 및 기술 스택
 */

import React from 'react'
import './ApiInfo.css'

export default function ApiInfo() {
  return (
    <div className="api-info">
      <h1>🔗 API & 기술 출처</h1>

      {/* YouTube Data API */}
      <div className="api-card">
        <div className="api-icon">📺</div>
        <div className="api-content">
          <h3>YouTube Data API v3</h3>
          <p>곡 검색 및 메타데이터</p>
          <div className="api-details">
            <strong>용도:</strong> 검색 기능, 제목/채널/썸네일 조회
          </div>
          <a 
            href="https://developers.google.com/youtube/v3" 
            target="_blank" 
            rel="noopener noreferrer"
            className="api-link"
          >
            → YouTube Data API 문서
          </a>
        </div>
      </div>

      {/* yt-dlp */}
      <div className="api-card">
        <div className="api-icon">⬇️</div>
        <div className="api-content">
          <h3>yt-dlp</h3>
          <p>YouTube 오디오 스트리밍 추출</p>
          <div className="api-details">
            <strong>용도:</strong> m4a 오디오 URL 추출, Range 요청 지원
          </div>
          <a 
            href="https://github.com/yt-dlp/yt-dlp" 
            target="_blank" 
            rel="noopener noreferrer"
            className="api-link"
          >
            → yt-dlp GitHub
          </a>
        </div>
      </div>

      {/* FastAPI */}
      <div className="api-card">
        <div className="api-icon">⚡</div>
        <div className="api-content">
          <h3>FastAPI</h3>
          <p>백엔드 서버 프레임워크</p>
          <div className="api-details">
            <strong>용도:</strong> RESTful API 서버, 비동기 처리, CORS
          </div>
          <a 
            href="https://fastapi.tiangolo.com/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="api-link"
          >
            → FastAPI 문서
          </a>
        </div>
      </div>

      {/* 자체 API */}
      <div className="api-card">
        <div className="api-icon">🎵</div>
        <div className="api-content">
          <h3>니나마무's 플레이어 API</h3>
          <p>자체 개발 백엔드 API</p>
          <div className="api-details">
            <strong>엔드포인트:</strong>
            <ul className="endpoint-list">
              <li><code>GET /api/resolve</code> — URL → 메타데이터</li>
              <li><code>GET /api/stream</code> — 오디오 스트리밍</li>
              <li><code>GET /api/playlist</code> — 재생목록 파싱</li>
              <li><code>GET /api/ranking/top</code> — Top N 랭킹</li>
              <li><code>GET /api/ranking/page</code> — 페이지네이션</li>
              <li><code>GET /api/categories</code> — 카테고리 목록</li>
            </ul>
          </div>
          <a 
            href="http://127.0.0.1:8000/api/docs" 
            target="_blank" 
            rel="noopener noreferrer"
            className="api-link"
          >
            → Swagger API 문서
          </a>
        </div>
      </div>

      {/* React & 프론트엔드 */}
      <div className="api-card">
        <div className="api-icon">⚛️</div>
        <div className="api-content">
          <h3>React 18 + Vite</h3>
          <p>프론트엔드 프레임워크</p>
          <div className="api-details">
            <strong>라이브러리:</strong> Noto Sans KR (Google Fonts)
          </div>
          <div className="links-row">
            <a 
              href="https://react.dev/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="api-link"
            >
              → React 문서
            </a>
            <a 
              href="https://vitejs.dev/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="api-link"
            >
              → Vite 문서
            </a>
          </div>
        </div>
      </div>

      {/* 인프라 */}
      <div className="api-card">
        <div className="api-icon">🔧</div>
        <div className="api-content">
          <h3>인프라 & 배포</h3>
          <p>서버 구성 및 관리</p>
          <div className="api-details">
            <strong>스택:</strong>
            <ul className="endpoint-list">
              <li>Nginx — 리버스 프록시</li>
              <li>systemd — 프로세스 관리</li>
              <li>OpenWrt — 네트워크 관리</li>
              <li>OCI Cloud — 호스팅</li>
            </ul>
          </div>
          <div className="links-row">
            <a 
              href="https://nginx.org/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="api-link"
            >
              → Nginx
            </a>
            <a 
              href="https://openwrt.org/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="api-link"
            >
              → OpenWrt
            </a>
          </div>
        </div>
      </div>

      {/* 라이선스 & 출처 */}
      <div className="api-notice">
        <h3>📄 라이선스 & 출처</h3>
        <p>
          본 프로젝트는 오픈소스 라이브러리들을 활용하고 있습니다.<br/>
          각 라이브러리의 라이선스를 존중합니다.
        </p>
        <ul>
          <li><strong>FastAPI:</strong> MIT License</li>
          <li><strong>yt-dlp:</strong> Unlicense</li>
          <li><strong>React:</strong> MIT License</li>
          <li><strong>Vite:</strong> MIT License</li>
          <li><strong>Nginx:</strong> 2-clause BSD License</li>
        </ul>
      </div>
    </div>
  )
}
