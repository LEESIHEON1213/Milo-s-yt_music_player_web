"""
통계 관리: 재생 데이터 저장/로드, 랭킹 계산, 카테고리 분류
"""

import json
import os
import re
import logging
from pathlib import Path
from typing import Optional, Dict, List
from collections import Counter
from urllib.parse import urlparse, parse_qs
from datetime import datetime

logger = logging.getLogger(__name__)

class PlaybackStats:
    """재생 통계 관리"""
    
    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(exist_ok=True)
        self.stats_file = self.data_dir / "playback_stats.json"
        self.load()
    
    def load(self):
        """JSON에서 통계 로드"""
        if self.stats_file.exists():
            try:
                with open(self.stats_file, "r", encoding="utf-8") as f:
                    self.stats = json.load(f)
                    logger.info(f"✅ 통계 로드: {len(self.stats)} 항목")
            except Exception as e:
                logger.error(f"❌ 통계 로드 실패: {e}")
                self.stats = {}
        else:
            self.stats = {}
            logger.info("📝 새 통계 파일 생성")
    
    def save(self):
        """JSON에 통계 저장"""
        try:
            with open(self.stats_file, "w", encoding="utf-8") as f:
                json.dump(self.stats, f, ensure_ascii=False, indent=2)
            logger.debug(f"💾 통계 저장: {len(self.stats)} 항목")
        except Exception as e:
            logger.error(f"❌ 통계 저장 실패: {e}")
    
    @staticmethod
    def _get_video_id(url: str) -> Optional[str]:
        """
        YouTube URL → video_id 추출
        지원: youtube.com/watch?v=..., youtu.be/..., youtube.com/playlist?list=...
        """
        if not url:
            return None
        
        try:
            # youtu.be 형식
            if "youtu.be/" in url:
                return url.split("youtu.be/")[1].split("?")[0]
            
            # youtube.com 형식
            if "youtube.com" in url:
                if "playlist" in url:
                    # 재생목록이면 None (개별 곡만 추적)
                    return None
                parsed = urlparse(url)
                if parsed.query:
                    params = parse_qs(parsed.query)
                    return params.get("v", [None])[0]
            
            return None
        except Exception as e:
            logger.warning(f"⚠️ Video ID 추출 실패 ({url[:50]}...): {e}")
            return None

    @staticmethod
    def _normalize_title(title: str, url: str = "") -> str:
        """
        제목 정규화.
        제목이 비어있거나, 이모지/기호/변형문자 등 '읽을 수 있는 본문 글자'가
        하나도 없으면 링크(URL)를 제목 대신 사용한다.
        (예: 'ᶜ(ᵒᵕᵒ)ᕤ', '♬', '😀', 공백만 등 → URL)
        본문 글자 = 기본 라틴 영숫자 / 한글 / 히라가나·가타카나 / 기본 CJK 한자
        URL도 없으면 '제목 없음'.
        """
        if title:
            stripped = title.strip()
            if stripped and re.search(r"[A-Za-z0-9가-힣ぁ-んァ-ヶ一-鿿]", stripped):
                return stripped
        # 유효한 제목이 없으면 링크를 제목으로
        return url.strip() if url and url.strip() else "제목 없음"
    
    def record_playback(self, url: str, title: str, thumbnail: str, 
                       uploader: str, duration: int, category: str = "Uncategorized"):
        """
        재생 기록 저장
        같은 video_id로 중복 제거
        """
        video_id = self._get_video_id(url)
        if not video_id:
            logger.warning(f"⚠️ 유효하지 않은 URL: {url[:50]}...")
            return False

        # 이모지/특수문자뿐인 제목은 링크(URL)를 제목으로 사용
        title = self._normalize_title(title, url)

        # 기존 항목이 있으면 재생 수 증가
        if video_id in self.stats:
            self.stats[video_id]["play_count"] += 1
            logger.info(f"🔄 재생 기록 업데이트: {title[:30]}... (총 {self.stats[video_id]['play_count']}회)")
        else:
            # 새 항목 추가
            self.stats[video_id] = {
                "video_id": video_id,
                "url": url,
                "title": title,
                "thumbnail": thumbnail,
                "uploader": uploader,
                "duration": duration,
                "category": category,
                "play_count": 1,
                "first_played": self._timestamp(),
                "last_played": self._timestamp()
            }
            logger.info(f"✨ 새 항목 기록: {title[:30]}...")
        
        # 마지막 재생 시간 업데이트
        self.stats[video_id]["last_played"] = self._timestamp()
        self.save()
        return True
    
    def get_top_ranked(self, limit: int = 3, category: str = None) -> List[Dict]:
        """
        상위 랭킹 조회
        category: None이면 전체, 특정 카테고리만 필터
        """
        items = self.stats.values()
        
        # 카테고리 필터
        if category and category != "All":
            items = [item for item in items if item.get("category") == category]
        
        # 재생 수 기준 정렬
        ranked = sorted(
            items,
            key=lambda x: x["play_count"],
            reverse=True
        )
        
        return ranked[:limit]
    
    def get_ranking_page(self, page: int = 1, page_size: int = 10, 
                         category: str = None) -> Dict:
        """
        페이지네이션된 랭킹 조회
        """
        items = self.stats.values()
        
        # 카테고리 필터
        if category and category != "All":
            items = [item for item in items if item.get("category") == category]
        
        # 재생 수 기준 정렬
        ranked = sorted(
            items,
            key=lambda x: x["play_count"],
            reverse=True
        )
        
        # 페이지네이션
        total = len(ranked)
        start = (page - 1) * page_size
        end = start + page_size
        
        return {
            "items": ranked[start:end],
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    
    def get_categories(self) -> List[str]:
        """모든 카테고리 목록"""
        categories = set()
        for item in self.stats.values():
            cat = item.get("category", "Uncategorized")
            if cat:
                categories.add(cat)
        return sorted(list(categories))
    
    def get_all_items(self) -> Dict:
        """전체 통계 반환"""
        return self.stats
    
    @staticmethod
    def _timestamp() -> str:
        """현재 타임스탐프"""
        return datetime.utcnow().isoformat()

# 전역 인스턴스
stats = PlaybackStats("data")
