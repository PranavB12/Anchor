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
from app.core.database import SessionLocal

@asynccontextmanager
async def lifespan(_app: FastAPI):
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
    finally:
        db.close()

    yield

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


@app.get("/")
def health_check():
    return {"status": "ok", "app": "Anchor API"}
