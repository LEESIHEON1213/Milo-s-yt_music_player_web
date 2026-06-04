"""
통계 관리: 재생 데이터 저장/로드, 랭킹 계산, 카테고리 분류
SQLite 기반 — 다중 워커 환경에서도 원자적 UPSERT로 동시성 안전 (재생수 롤백 방지)
"""

import json
import os
import re
import sqlite3
import logging
import threading
from pathlib import Path
from typing import Optional, Dict, List
from urllib.parse import urlparse, parse_qs
from datetime import datetime

logger = logging.getLogger(__name__)


class PlaybackStats:
    """재생 통계 관리 (SQLite)"""

    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(exist_ok=True)
        self.db_file = self.data_dir / "playback_stats.db"
        self.json_file = self.data_dir / "playback_stats.json"  # 기존 데이터 (마이그레이션용)
        self._local = threading.local()
        self._init_db()
        self._migrate_from_json()

    # ── DB 연결 (워커/스레드별로 분리) ──────────────────────────
    def _conn(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(
                str(self.db_file),
                timeout=10.0,            # 잠금 대기 (동시 쓰기 충돌 방지)
                check_same_thread=False,
            )
            conn.row_factory = sqlite3.Row
            # WAL 모드: 동시 읽기/쓰기 성능 + 안정성 향상
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.execute("PRAGMA busy_timeout=10000;")
            self._local.conn = conn
        return conn

    def _init_db(self):
        conn = self._conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS playback (
                video_id     TEXT PRIMARY KEY,
                url          TEXT,
                title        TEXT,
                thumbnail    TEXT,
                uploader     TEXT,
                duration     INTEGER,
                category     TEXT,
                play_count   INTEGER NOT NULL DEFAULT 0,
                first_played TEXT,
                last_played  TEXT
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_play_count ON playback(play_count DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_category ON playback(category)")
        conn.commit()
        logger.info("✅ SQLite 통계 DB 준비 완료")

    def _migrate_from_json(self):
        """기존 playback_stats.json 데이터를 DB로 1회 이전 (DB가 비어있을 때만)"""
        conn = self._conn()
        cur = conn.execute("SELECT COUNT(*) AS c FROM playback")
        if cur.fetchone()["c"] > 0:
            return  # 이미 데이터 있음 → 마이그레이션 안 함
        if not self.json_file.exists():
            return
        try:
            with open(self.json_file, "r", encoding="utf-8") as f:
                old = json.load(f)
            if not isinstance(old, dict) or not old:
                return
            for vid, item in old.items():
                conn.execute("""
                    INSERT OR IGNORE INTO playback
                    (video_id, url, title, thumbnail, uploader, duration, category,
                     play_count, first_played, last_played)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    item.get("video_id", vid),
                    item.get("url", ""),
                    item.get("title", ""),
                    item.get("thumbnail", ""),
                    item.get("uploader", ""),
                    item.get("duration", 0),
                    item.get("category", "Uncategorized"),
                    item.get("play_count", 0),
                    item.get("first_played", self._timestamp()),
                    item.get("last_played", self._timestamp()),
                ))
            conn.commit()
            # 기존 JSON 백업 (덮어쓰기 방지)
            backup = self.json_file.with_suffix(".json.migrated")
            try:
                self.json_file.rename(backup)
            except Exception:
                pass
            logger.info(f"✅ 기존 JSON → SQLite 마이그레이션 완료: {len(old)} 항목")
        except Exception as e:
            logger.error(f"❌ JSON 마이그레이션 실패: {e}")

    # ── URL / 제목 유틸 (기존과 동일) ───────────────────────────
    @staticmethod
    def _get_video_id(url: str) -> Optional[str]:
        if not url:
            return None
        try:
            if "youtu.be/" in url:
                return url.split("youtu.be/")[1].split("?")[0]
            if "youtube.com" in url:
                if "playlist" in url:
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
        if title:
            stripped = title.strip()
            if stripped and re.search(r"[A-Za-z0-9가-힣ぁ-んァ-ヶ一-鿿]", stripped):
                return stripped
        return url.strip() if url and url.strip() else "제목 없음"

    # ── 재생 기록 (원자적 UPSERT — 롤백 불가) ───────────────────
    def record_playback(self, url: str, title: str, thumbnail: str,
                         uploader: str, duration: int, category: str = "Uncategorized"):
        video_id = self._get_video_id(url)
        if not video_id:
            logger.warning(f"⚠️ 유효하지 않은 URL: {url[:50]}...")
            return False

        title = self._normalize_title(title, url)
        now = self._timestamp()
        conn = self._conn()
        try:
            # 한 번의 원자적 쿼리로 INSERT 또는 play_count+1.
            # 동시에 여러 워커가 호출해도 DB가 직렬화하므로 정확히 누적됨.
            conn.execute("""
                INSERT INTO playback
                    (video_id, url, title, thumbnail, uploader, duration, category,
                     play_count, first_played, last_played)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                ON CONFLICT(video_id) DO UPDATE SET
                    play_count  = play_count + 1,
                    last_played = excluded.last_played,
                    title       = excluded.title,
                    thumbnail   = excluded.thumbnail,
                    uploader    = excluded.uploader,
                    category    = excluded.category
            """, (video_id, url, title, thumbnail, uploader, duration, category, now, now))
            conn.commit()
            return True
        except Exception as e:
            logger.error(f"❌ 재생 기록 실패: {e}")
            try:
                conn.rollback()
            except Exception:
                pass
            return False

    # ── 조회 ────────────────────────────────────────────────────
    def _row_to_dict(self, row: sqlite3.Row) -> Dict:
        return {
            "video_id": row["video_id"],
            "url": row["url"],
            "title": row["title"],
            "thumbnail": row["thumbnail"],
            "uploader": row["uploader"],
            "duration": row["duration"],
            "category": row["category"],
            "play_count": row["play_count"],
            "first_played": row["first_played"],
            "last_played": row["last_played"],
        }

    def get_top_ranked(self, limit: int = 3, category: str = None) -> List[Dict]:
        conn = self._conn()
        if category and category != "All":
            cur = conn.execute(
                "SELECT * FROM playback WHERE category = ? ORDER BY play_count DESC, last_played DESC LIMIT ?",
                (category, limit),
            )
        else:
            cur = conn.execute(
                "SELECT * FROM playback ORDER BY play_count DESC, last_played DESC LIMIT ?",
                (limit,),
            )
        return [self._row_to_dict(r) for r in cur.fetchall()]

    def get_ranking_page(self, page: int = 1, page_size: int = 10,
                         category: str = None) -> Dict:
        conn = self._conn()
        where = ""
        params: list = []
        if category and category != "All":
            where = "WHERE category = ?"
            params.append(category)

        total = conn.execute(
            f"SELECT COUNT(*) AS c FROM playback {where}", params
        ).fetchone()["c"]

        offset = (page - 1) * page_size
        cur = conn.execute(
            f"SELECT * FROM playback {where} ORDER BY play_count DESC, last_played DESC LIMIT ? OFFSET ?",
            params + [page_size, offset],
        )
        items = [self._row_to_dict(r) for r in cur.fetchall()]

        return {
            "items": items,
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
        }

    def get_categories(self, top_n: int = 10) -> List[str]:
        """
        재생수 상위 top_n 곡에 등장하는 카테고리만 반환.
        (랭킹에 노출된 곡들의 태그만 필터로 보여주기 위함)
        top_n=None 이면 전체 곡 기준.
        """
        conn = self._conn()
        if top_n:
            cur = conn.execute(
                "SELECT DISTINCT category FROM ("
                "  SELECT category FROM playback ORDER BY play_count DESC, last_played DESC LIMIT ?"
                ") WHERE category IS NOT NULL",
                (top_n,),
            )
        else:
            cur = conn.execute(
                "SELECT DISTINCT category FROM playback WHERE category IS NOT NULL"
            )
        cats = {r["category"] for r in cur.fetchall() if r["category"]}
        return sorted(cats)

    def get_all_items(self) -> Dict:
        conn = self._conn()
        cur = conn.execute("SELECT * FROM playback")
        return {r["video_id"]: self._row_to_dict(r) for r in cur.fetchall()}

    def count_tracks(self) -> int:
        conn = self._conn()
        return conn.execute("SELECT COUNT(*) AS c FROM playback").fetchone()["c"]

    @staticmethod
    def _timestamp() -> str:
        return datetime.utcnow().isoformat()


# 전역 인스턴스
stats = PlaybackStats("data")
