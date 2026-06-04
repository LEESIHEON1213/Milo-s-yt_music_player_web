"""
니나마무's 플레이어 — FastAPI 백엔드 (보안 강화 + 랭킹)
"""

import os
import subprocess
import shutil
import json
import logging
import re
import time
from typing import Optional
from urllib.parse import quote, urlparse, parse_qs
from datetime import datetime

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from stats import stats

# ─────────────────────────────────────────────
# 환경설정
# ─────────────────────────────────────────────

load_dotenv()

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 환경변수
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost"
).split(",")

PROXY = os.getenv("HTTP_PROXY") or None
if not PROXY:
    logger.warning("⚠️ HTTP_PROXY 미설정 — 프록시 없이 직접 연결합니다")

# 유튜브 쿠키 파일 (있으면 yt-dlp에 --cookies 로 전달, 봇 차단 우회용)
YOUTUBE_COOKIES = os.getenv("YOUTUBE_COOKIES") or None
if YOUTUBE_COOKIES and os.path.isfile(YOUTUBE_COOKIES):
    logger.info(f"🍪 쿠키 파일 사용: {YOUTUBE_COOKIES}")
elif YOUTUBE_COOKIES:
    logger.warning(f"⚠️ YOUTUBE_COOKIES 경로에 파일이 없음: {YOUTUBE_COOKIES}")
    YOUTUBE_COOKIES = None

YT_API_TIMEOUT = int(os.getenv("YT_API_TIMEOUT", "30"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "2"))
MAX_PLAYLIST_SIZE = int(os.getenv("MAX_PLAYLIST_SIZE", "500"))
MAX_RANKING_SIZE = int(os.getenv("MAX_RANKING_SIZE", "100"))

logger.info(f"✅ FastAPI 시작")
logger.info(f"   CORS Origins: {len(ALLOWED_ORIGINS)}")
logger.info(f"   Proxy: {PROXY}")
logger.info(f"   Timeout: {YT_API_TIMEOUT}s")

# ─────────────────────────────────────────────
# FastAPI 앱 초기화
# ─────────────────────────────────────────────

app = FastAPI(
    title="NinamamuPlayer API",
    version="1.0.0-security",
    docs_url="/api/docs"
)

# CORS 설정 (보안)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    max_age=600,
)

# ─────────────────────────────────────────────
# 유효성 검증
# ─────────────────────────────────────────────

YOUTUBE_URL_PATTERN = re.compile(
    r"^https?://(www\.)?"
    r"(youtube\.com|youtu\.be|youtube-nocookie\.com)"
    r"(/|$)"
)

def validate_youtube_url(url: str) -> bool:
    """YouTube URL 유효성 검증"""
    if not url or len(url) > 2048:
        logger.warning(f"❌ URL 길이 초과: {len(url)}")
        return False
    
    if not YOUTUBE_URL_PATTERN.match(url):
        logger.warning(f"❌ YouTube URL 아님: {url[:50]}")
        return False
    
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False
    
    return True

def get_video_id(url: str) -> Optional[str]:
    """YouTube URL에서 video_id 추출"""
    try:
        if "youtu.be/" in url:
            return url.split("youtu.be/")[1].split("?")[0]
        
        if "youtube.com" in url:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)
            return params.get("v", [None])[0]
    except Exception as e:
        logger.debug(f"Video ID 추출 실패: {e}")
    
    return None

# ─────────────────────────────────────────────
# yt-dlp 래퍼 (재시도 로직)
# ─────────────────────────────────────────────

def find_ytdlp() -> str:
    """yt-dlp 경로 확인"""
    path = shutil.which("yt-dlp")
    if not path:
        logger.error("❌ yt-dlp 설치 안 됨")
        raise HTTPException(
            status_code=500,
            detail="Server configuration error"
        )
    return path

def run_ytdlp(
    args: list,
    timeout: int = YT_API_TIMEOUT,
    retries: int = MAX_RETRIES
) -> Optional[str]:
    """
    yt-dlp 실행 (재시도 로직 포함)
    """
    last_error = None
    
    for attempt in range(1, retries + 1):
        try:
            cmd = [find_ytdlp()] \
                + (["--proxy", PROXY] if PROXY else []) \
                + (["--cookies", YOUTUBE_COOKIES] if YOUTUBE_COOKIES else []) \
                + ["--remote-components", "ejs:github"] + args
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                errors="replace"
            )
            
            if result.returncode == 0:
                return result.stdout.strip() or None
            
            last_error = result.stderr[:200] if result.stderr else "Unknown error"
            logger.warning(f"[시도 {attempt}/{retries}] yt-dlp 실패: {last_error}")
            
            if attempt < retries:
                wait = 2 ** (attempt - 1)
                time.sleep(wait)
        
        except subprocess.TimeoutExpired:
            last_error = f"Timeout ({timeout}s)"
            logger.warning(f"[시도 {attempt}] {last_error}")
        
        except Exception as e:
            last_error = str(e)[:200]
            logger.error(f"[시도 {attempt}] 예외: {last_error}")
    
    logger.error(f"❌ yt-dlp 최종 실패: {last_error}")
    return None

# ─────────────────────────────────────────────
# 응답 모델
# ─────────────────────────────────────────────

class AudioResolveResponse(BaseModel):
    url: str
    title: str
    duration: int
    thumbnail: str
    uploader: str
    video_id: str

class PlaylistTrack(BaseModel):
    url: str
    title: str
    duration: int
    thumbnail: str
    uploader: str

class PlaylistResponse(BaseModel):
    tracks: list[PlaylistTrack]

class RankingItem(BaseModel):
    rank: int
    video_id: str
    title: str
    thumbnail: str
    uploader: str
    play_count: int
    category: str
    url: str

class RankingResponse(BaseModel):
    items: list[RankingItem]

class RankingPageResponse(BaseModel):
    items: list[RankingItem]
    page: int
    page_size: int
    total: int
    total_pages: int

# ─────────────────────────────────────────────
# 엔드포인트
# ─────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "service": "NinamamuPlayer API v1.0.0"}

@app.get("/api/resolve", response_model=AudioResolveResponse)
def resolve_audio(url: str = Query(...)):
    """YouTube URL → 메타데이터 + 스트리밍 URL"""
    
    if not validate_youtube_url(url):
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube URL. Use youtube.com or youtu.be links."
        )
    
    video_id = get_video_id(url)
    
    # 메타데이터 추출
    meta_args = [
        url, "-j",
        "--no-playlist",
        "--no-warnings",
        "--quiet",
        "--skip-download",
    ]
    meta_raw = run_ytdlp(meta_args, timeout=20)
    
    if not meta_raw:
        logger.warning(f"메타데이터 로드 실패: {url[:50]}")
        raise HTTPException(
            status_code=502,
            detail="Unable to fetch video metadata. Try another video."
        )
    
    try:
        meta = json.loads(meta_raw)
    except json.JSONDecodeError:
        logger.error(f"JSON 파싱 실패 ({video_id})")
        raise HTTPException(
            status_code=500,
            detail="Server error. Please try again."
        )
    
    # 카테고리 추출 (태그에서)
    category = extract_category(meta)
    
    # 통계에 기록
    stats.record_playback(
        url=url,
        title=meta.get("title", "Unknown"),
        thumbnail=meta.get("thumbnail", ""),
        uploader=meta.get("uploader", "Unknown"),
        duration=int(meta.get("duration", 0)),
        category=category
    )
    
    stream_url = f"/api/stream?url={quote(url)}"
    
    return AudioResolveResponse(
        url=stream_url,
        title=meta.get("title", "Unknown"),
        duration=int(meta.get("duration", 0)),
        thumbnail=meta.get("thumbnail", ""),
        uploader=meta.get("uploader", "Unknown"),
        video_id=video_id or ""
    )

def extract_category(meta: dict) -> str:
    """메타데이터에서 카테고리 추출"""
    # YouTube 태그 사용
    tags = meta.get("tags", [])
    if tags and len(tags) > 0:
        return tags[0][:30]
    
    # 카테고리 필드 (있으면)
    category = meta.get("category", "")
    if category:
        return category[:30]
    
    return "Uncategorized"

@app.get("/api/stream")
async def stream_audio(url: str = Query(...), request: Request = None):
    """오디오 스트리밍 (Range 요청 지원)"""
    
    if not validate_youtube_url(url):
        raise HTTPException(status_code=400, detail="Invalid URL")
    
    # 오디오 URL 추출
    args = [
        url,
        "-f", "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio",
        "--get-url",
        "--no-playlist",
        "--no-warnings",
        "--quiet",
    ]
    audio_url = run_ytdlp(args, timeout=20)
    
    if not audio_url:
        logger.warning(f"오디오 URL 추출 실패: {url[:50]}")
        raise HTTPException(
            status_code=502,
            detail="Unable to extract audio. Try another video."
        )
    
    audio_url = audio_url.splitlines()[0].strip()
    
    # Range 헤더 전달
    range_header = request.headers.get("range") if request else None
    req_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }
    if range_header:
        req_headers["Range"] = range_header
    
    # 프록시 경유 스트리밍
    try:
        client = httpx.AsyncClient(
            timeout=60,
            follow_redirects=True,
            proxy=PROXY
        )
        resp = await client.send(
            httpx.Request("GET", audio_url, headers=req_headers),
            stream=True,
        )
    except Exception as e:
        logger.error(f"스트리밍 오류: {e}")
        raise HTTPException(status_code=502, detail="Streaming failed")
    
    status_code = resp.status_code
    content_length = resp.headers.get("content-length")
    content_range = resp.headers.get("content-range")
    
    resp_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache",
    }
    if content_length:
        resp_headers["Content-Length"] = content_length
    if content_range:
        resp_headers["Content-Range"] = content_range
    
    async def stream_gen():
        try:
            async for chunk in resp.aiter_bytes(65536):
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()
    
    return StreamingResponse(
        stream_gen(),
        status_code=status_code,
        media_type="audio/mp4",
        headers=resp_headers,
    )

@app.get("/api/playlist", response_model=PlaylistResponse)
def get_playlist(url: str = Query(...)):
    """재생목록 → 개별 곡 메타데이터"""
    
    if not validate_youtube_url(url):
        raise HTTPException(status_code=400, detail="Invalid URL")
    
    args = [
        url, "-j",
        "--flat-playlist",
        "--playlist-items", f"1-{MAX_PLAYLIST_SIZE}",
        "--no-warnings",
        "--quiet",
    ]
    raw = run_ytdlp(args, timeout=60, retries=2)
    
    if not raw:
        logger.warning(f"재생목록 로드 실패: {url[:50]}")
        raise HTTPException(
            status_code=502,
            detail="Unable to load playlist. Try another playlist."
        )
    
    tracks = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
            vid_id = obj.get("id", "")
            vid_url = obj.get("url") or obj.get("webpage_url") or vid_id
            
            if not vid_url or not vid_url.startswith("http"):
                vid_url = f"https://www.youtube.com/watch?v={vid_url}"
            
            thumbnail = obj.get("thumbnail", "")
            if not thumbnail and vid_id:
                thumbnail = f"https://i.ytimg.com/vi/{vid_id}/mqdefault.jpg"
            
            tracks.append(PlaylistTrack(
                url=vid_url,
                title=obj.get("title", "Unknown")[:100],
                duration=int(obj.get("duration", 0)),
                thumbnail=thumbnail,
                uploader=obj.get("uploader", "Unknown")[:50]
            ))
        except Exception as e:
            logger.debug(f"곡 파싱 실패: {e}")
            continue
    
    if not tracks:
        raise HTTPException(status_code=400, detail="No tracks in playlist")
    
    return PlaylistResponse(tracks=tracks)

# ─────────────────────────────────────────────
# 랭킹 엔드포인트 (새로 추가)
# ─────────────────────────────────────────────

@app.get("/api/ranking/top", response_model=RankingResponse)
def get_top_ranking(limit: int = Query(3, ge=1, le=100),
                    category: str = Query("All")):
    """Top N 랭킹 조회"""
    items = stats.get_top_ranked(limit=limit, category=category if category != "All" else None)
    
    response_items = [
        RankingItem(
            rank=idx + 1,
            video_id=item.get("video_id", ""),
            title=stats._normalize_title(item.get("title", ""), item.get("url", "")),
            thumbnail=item.get("thumbnail", ""),
            uploader=item.get("uploader", "Unknown"),
            play_count=item.get("play_count", 0),
            category=item.get("category", "Uncategorized"),
            url=item.get("url", "")
        )
        for idx, item in enumerate(items)
    ]
    
    return RankingResponse(items=response_items)

@app.get("/api/ranking/page", response_model=RankingPageResponse)
def get_ranking_page(page: int = Query(1, ge=1),
                     page_size: int = Query(10, ge=1, le=100),
                     category: str = Query("All")):
    """페이지네이션된 랭킹 (최대 100개)"""
    result = stats.get_ranking_page(
        page=page,
        page_size=page_size,
        category=category if category != "All" else None
    )
    
    response_items = [
        RankingItem(
            rank=(page - 1) * page_size + idx + 1,
            video_id=item.get("video_id", ""),
            title=stats._normalize_title(item.get("title", ""), item.get("url", "")),
            thumbnail=item.get("thumbnail", ""),
            uploader=item.get("uploader", "Unknown"),
            play_count=item.get("play_count", 0),
            category=item.get("category", "Uncategorized"),
            url=item.get("url", "")
        )
        for idx, item in enumerate(result["items"])
    ]
    
    return RankingPageResponse(
        items=response_items,
        page=result["page"],
        page_size=result["page_size"],
        total=result["total"],
        total_pages=result["total_pages"]
    )

@app.get("/api/categories")
def get_categories():
    """모든 카테고리 목록"""
    categories = stats.get_categories()
    return {
        "categories": ["All"] + categories,
        "total": len(categories) + 1
    }

@app.get("/api/health")
def health():
    """상태 확인"""
    ytdlp_ok = shutil.which("yt-dlp") is not None
    data_ok = stats.db_file.exists()
    return {
        "status": "ok",
        "ytdlp": ytdlp_ok,
        "data_file": data_ok,
        "total_tracks": stats.count_tracks()
    }

# ─────────────────────────────────────────────
# 예외 핸들러 (정보 유출 방지)
# ─────────────────────────────────────────────

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    """모든 예외를 generic 응답으로"""
    logger.error(f"❌ 처리되지 않은 오류: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
