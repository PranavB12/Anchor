"""
S3 upload utility.
Uses boto3 with credentials from settings (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
AWS_REGION, S3_BUCKET_NAME).
"""

import uuid

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status

from app.core.config import settings

# 10 MB upload limit
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

ALLOWED_MIME_TYPES = {
    # Images
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    # Documents
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    # Audio
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    # Generic binary (e.g. from mobile pickers that don't know the type)
    "application/octet-stream",
}


def _s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )


def validate_upload(file_bytes: bytes, mime_type: str) -> None:
    """Raise 400/413 if the file is too large or the mime type is not allowed."""
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds the 10 MB limit",
        )
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {mime_type}",
        )


def upload_to_s3(file_bytes: bytes, original_filename: str, mime_type: str) -> str:
    """
    Upload file bytes to S3 under a UUID key and return the public URL.
    Raises 503 if S3 is not configured, 502 on upload failure.
    """
    if not settings.AWS_ACCESS_KEY_ID or not settings.S3_BUCKET_NAME:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File storage is not configured on this server",
        )

    ext = original_filename.rsplit(".", 1)[-1] if "." in original_filename else ""
    key = f"content/{uuid.uuid4()}.{ext}" if ext else f"content/{uuid.uuid4()}"

    try:
        _s3_client().put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=key,
            Body=file_bytes,
            ContentType=mime_type,
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Upload failed: {exc}",
        )

    return (
        f"https://{settings.S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
    )
