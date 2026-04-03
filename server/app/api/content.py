"""
Endpoints:
    POST   /anchors/{anchor_id}/content/text    — attach text content to an anchor
    POST   /anchors/{anchor_id}/content/link    — attach a link to an anchor
    POST   /anchors/{anchor_id}/content         — upload a file to S3 and attach it (see file upload section)
    GET    /anchors/{anchor_id}/content         — list all content attached to an anchor
    DELETE /anchors/{anchor_id}/content/{content_id} — delete a content item (creator only)
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.s3 import upload_to_s3, validate_upload
from app.schemas.content import ContentResponse, LinkContentRequest, TextContentRequest

router = APIRouter(prefix="/anchors", tags=["Content"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_anchor_creator(db: Session, anchor_id: str) -> str:
    """Return creator_id for the anchor, or raise 404."""
    row = db.execute(
        text("SELECT creator_id FROM anchors WHERE anchor_id = :anchor_id"),
        {"anchor_id": anchor_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anchor not found")
    return row.creator_id


def _require_creator(user_id: str, creator_id: str) -> None:
    if user_id != creator_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the anchor creator can manage its content",
        )


# ── Text ──────────────────────────────────────────────────────────────────────

@router.post(
    "/{anchor_id}/content/text",
    response_model=ContentResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_text_content(
    anchor_id: str,
    body: TextContentRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    creator_id = _get_anchor_creator(db, anchor_id)
    _require_creator(user_id, creator_id)

    content_id = str(uuid.uuid4())
    size_bytes = len(body.text_body.encode("utf-8"))
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    db.execute(
        text("""
            INSERT INTO Content (content_id, anchor_id, content_type, size_bytes, uploaded_at)
            VALUES (:content_id, :anchor_id, 'TEXT', :size_bytes, :uploaded_at)
        """),
        {"content_id": content_id, "anchor_id": anchor_id, "size_bytes": size_bytes, "uploaded_at": now},
    )
    db.execute(
        text("""
            INSERT INTO text_content (content_id, text_body, language)
            VALUES (:content_id, :text_body, :language)
        """),
        {"content_id": content_id, "text_body": body.text_body, "language": body.language},
    )
    db.commit()

    return ContentResponse(
        content_id=content_id,
        anchor_id=anchor_id,
        creator_id=creator_id,
        content_type="TEXT",
        size_bytes=size_bytes,
        uploaded_at=now,
        text_body=body.text_body,
        language=body.language,
    )


# ── Link ──────────────────────────────────────────────────────────────────────

@router.post(
    "/{anchor_id}/content/link",
    response_model=ContentResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_link_content(
    anchor_id: str,
    body: LinkContentRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    creator_id = _get_anchor_creator(db, anchor_id)
    _require_creator(user_id, creator_id)

    content_id = str(uuid.uuid4())
    size_bytes = len(body.url.encode("utf-8"))
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    db.execute(
        text("""
            INSERT INTO Content (content_id, anchor_id, content_type, size_bytes, uploaded_at)
            VALUES (:content_id, :anchor_id, 'LINK', :size_bytes, :uploaded_at)
        """),
        {"content_id": content_id, "anchor_id": anchor_id, "size_bytes": size_bytes, "uploaded_at": now},
    )
    db.execute(
        text("""
            INSERT INTO link_content (content_id, url, page_title, preview_url)
            VALUES (:content_id, :url, :page_title, :preview_url)
        """),
        {
            "content_id": content_id,
            "url": body.url,
            "page_title": body.page_title,
            "preview_url": body.preview_url,
        },
    )
    db.commit()

    return ContentResponse(
        content_id=content_id,
        anchor_id=anchor_id,
        creator_id=creator_id,
        content_type="LINK",
        size_bytes=size_bytes,
        uploaded_at=now,
        url=body.url,
        page_title=body.page_title,
        preview_url=body.preview_url,
    )


# ── File upload ───────────────────────────────────────────────────────────────

@router.post(
    "/{anchor_id}/content",
    response_model=ContentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_file_content(
    anchor_id: str,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    creator_id = _get_anchor_creator(db, anchor_id)
    _require_creator(user_id, creator_id)

    mime_type = file.content_type or "application/octet-stream"
    file_bytes = await file.read()

    validate_upload(file_bytes, mime_type)

    file_url = upload_to_s3(file_bytes, file.filename or "upload", mime_type)

    content_id = str(uuid.uuid4())
    size_bytes = len(file_bytes)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    db.execute(
        text("""
            INSERT INTO Content (content_id, anchor_id, content_type, size_bytes, uploaded_at)
            VALUES (:content_id, :anchor_id, 'FILE', :size_bytes, :uploaded_at)
        """),
        {"content_id": content_id, "anchor_id": anchor_id, "size_bytes": size_bytes, "uploaded_at": now},
    )
    db.execute(
        text("""
            INSERT INTO media_content (content_id, file_url, mime_type, file_name)
            VALUES (:content_id, :file_url, :mime_type, :file_name)
        """),
        {
            "content_id": content_id,
            "file_url": file_url,
            "mime_type": mime_type,
            "file_name": file.filename,
        },
    )
    db.commit()

    return ContentResponse(
        content_id=content_id,
        anchor_id=anchor_id,
        creator_id=creator_id,
        content_type="FILE",
        size_bytes=size_bytes,
        uploaded_at=now,
        file_url=file_url,
        mime_type=mime_type,
        file_name=file.filename,
    )


# ── GET all content for an anchor ─────────────────────────────────────────────

@router.get("/{anchor_id}/content", response_model=list[ContentResponse])
def get_anchor_content(
    anchor_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    creator_id = _get_anchor_creator(db, anchor_id)

    rows = db.execute(
        text("""
            SELECT
                c.content_id, c.content_type, c.size_bytes, c.uploaded_at,
                tc.text_body, tc.language,
                lc.url, lc.page_title, lc.preview_url,
                mc.file_url, mc.mime_type, mc.file_name
            FROM Content c
            LEFT JOIN text_content  tc ON c.content_id = tc.content_id
            LEFT JOIN link_content  lc ON c.content_id = lc.content_id
            LEFT JOIN media_content mc ON c.content_id = mc.content_id
            WHERE c.anchor_id = :anchor_id
            ORDER BY c.uploaded_at ASC
        """),
        {"anchor_id": anchor_id},
    ).fetchall()

    return [
        ContentResponse(
            content_id=row.content_id,
            anchor_id=anchor_id,
            creator_id=creator_id,
            content_type=row.content_type,
            size_bytes=row.size_bytes,
            uploaded_at=row.uploaded_at,
            text_body=row.text_body,
            language=row.language,
            url=row.url,
            page_title=row.page_title,
            preview_url=row.preview_url,
            file_url=row.file_url,
            mime_type=row.mime_type,
            file_name=row.file_name,
        )
        for row in rows
    ]


# ── DELETE a content item ──────────────────────────────────────────────────────

@router.delete("/{anchor_id}/content/{content_id}")
def delete_content(
    anchor_id: str,
    content_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    creator_id = _get_anchor_creator(db, anchor_id)
    _require_creator(user_id, creator_id)

    row = db.execute(
        text("SELECT content_id FROM Content WHERE content_id = :content_id AND anchor_id = :anchor_id"),
        {"content_id": content_id, "anchor_id": anchor_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found")

    db.execute(
        text("DELETE FROM Content WHERE content_id = :content_id"),
        {"content_id": content_id},
    )
    db.commit()

    return {"message": "Content deleted", "content_id": content_id}
