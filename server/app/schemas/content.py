from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TextContentRequest(BaseModel):
    text_body: str
    language: Optional[str] = None


class LinkContentRequest(BaseModel):
    url: str
    page_title: Optional[str] = None
    preview_url: Optional[str] = None


class ContentResponse(BaseModel):
    """Unified response for all content types (TEXT, LINK, FILE)."""
    content_id: str
    anchor_id: str
    creator_id: str
    content_type: str          # TEXT | LINK | FILE
    size_bytes: int
    uploaded_at: datetime

    # TEXT fields
    text_body: Optional[str] = None
    language: Optional[str] = None

    # LINK fields
    url: Optional[str] = None
    page_title: Optional[str] = None
    preview_url: Optional[str] = None

    # FILE fields
    file_url: Optional[str] = None
    mime_type: Optional[str] = None
    file_name: Optional[str] = None
