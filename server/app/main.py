"""
Anchor — FastAPI application entry point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.user import router as user_router

app = FastAPI(
    title="Anchor API",
    description="Location-based information sharing platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(user_router)


@app.get("/")
def health_check():
    return {"status": "ok", "app": "Anchor API"}