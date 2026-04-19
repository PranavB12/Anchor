"""
Anchor — FastAPI application entry point
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.auth import router as auth_router
from app.api.user import router as user_router
from app.api.anchor import router as anchor_router
from app.api.report import router as report_router
from app.api.admin import router as admin_router
from app.api.content import router as content_router
from app.core.database import SessionLocal
from app.api.circle import router as circle_router


def _bootstrap_core_tables():
    db = SessionLocal()
    try:
        check_col = db.execute(text("""
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_name = 'users'
              AND column_name = 'is_banned'
              AND table_schema = DATABASE()
        """)).fetchone()
        if check_col and check_col[0] == 0:
            db.execute(text("ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT FALSE"))
            db.commit()

        db.execute(text("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                log_id CHAR(36) PRIMARY KEY,
                user_id CHAR(36) NOT NULL,
                action_type VARCHAR(50) NOT NULL,
                target_id CHAR(36) NULL,
                target_type VARCHAR(50) NULL,
                metadata JSON NULL,
                ip_address VARCHAR(45) NULL,
                timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                INDEX idx_audit_user (user_id),
                INDEX idx_audit_action (action_type)
            )
        """))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS blocked_users (
                blocker_id CHAR(36) NOT NULL,
                blocked_user_id CHAR(36) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (blocker_id, blocked_user_id),
                FOREIGN KEY (blocker_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (blocked_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                INDEX idx_blocked_users_blocked_user (blocked_user_id)
            )
        """))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS circles (
                circle_id CHAR(36) PRIMARY KEY,
                owner_id CHAR(36) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT NULL,
                visibility ENUM('PUBLIC', 'PRIVATE') NOT NULL DEFAULT 'PRIVATE',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE,
                INDEX idx_circles_owner (owner_id)
            )
        """))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS circle_members (
                circle_id CHAR(36) NOT NULL,
                user_id CHAR(36) NOT NULL,
                joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (circle_id, user_id),
                FOREIGN KEY (circle_id) REFERENCES circles(circle_id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        """))
        check_circle_id_col = db.execute(
            text("SHOW COLUMNS FROM anchors LIKE 'circle_id'")
        ).fetchone()
        if check_circle_id_col is None:
            db.execute(text("ALTER TABLE anchors ADD COLUMN circle_id CHAR(36) NULL"))
            db.execute(text("ALTER TABLE anchors ADD INDEX idx_anchors_circle_id (circle_id)"))
            db.execute(text("""
                ALTER TABLE anchors
                ADD CONSTRAINT fk_anchors_circle_id
                FOREIGN KEY (circle_id) REFERENCES circles(circle_id) ON DELETE SET NULL
            """))
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _bootstrap_core_tables()
    yield


_bootstrap_core_tables()

app = FastAPI(
    title="Anchor API",
    description="Location-based information sharing platform",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(user_router)
app.include_router(anchor_router)
app.include_router(report_router)
app.include_router(admin_router)
app.include_router(content_router)
app.include_router(circle_router)


@app.get("/")
def health_check():
    return {"status": "ok", "app": "Anchor API"}
