"""S3 (or S3-compatible) image storage.

Lazy boto3 import so the API still starts when boto3 isn't installed. When
`s3_bucket` is empty, `upload_image()` raises StorageNotConfigured — the upload
endpoint translates that to HTTP 503 so users know what to fix without grepping logs.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import BinaryIO

from api.config import get_settings

logger = logging.getLogger(__name__)


class StorageNotConfigured(RuntimeError):
    pass


@dataclass
class StoredObject:
    object_key: str
    public_url: str


_ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
}


def _client():
    settings = get_settings()
    if not settings.s3_bucket:
        raise StorageNotConfigured(
            "S3 storage is not configured. Set S3_BUCKET (and S3_REGION) on the API."
        )
    try:
        import boto3
    except ImportError as e:
        raise StorageNotConfigured("boto3 is required for S3 uploads.") from e

    kwargs: dict = {}
    if settings.s3_region:
        kwargs["region_name"] = settings.s3_region
    if settings.s3_endpoint_url:
        kwargs["endpoint_url"] = settings.s3_endpoint_url
    return boto3.client("s3", **kwargs)


def _public_url(object_key: str) -> str:
    settings = get_settings()
    if settings.s3_public_base_url:
        base = settings.s3_public_base_url.rstrip("/")
        return f"{base}/{object_key}"
    if settings.s3_endpoint_url:
        return f"{settings.s3_endpoint_url.rstrip('/')}/{settings.s3_bucket}/{object_key}"
    region = settings.s3_region or "us-east-1"
    return f"https://{settings.s3_bucket}.s3.{region}.amazonaws.com/{object_key}"


def upload_image(
    file_obj: BinaryIO,
    *,
    content_type: str,
    prefix: str,
    original_filename: str | None = None,
) -> StoredObject:
    """Upload a file-like to S3 under `prefix/<uuid>.<ext>`. Returns key + URL."""
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise ValueError(
            f"Unsupported image type {content_type}. Allowed: jpeg, png, webp, gif."
        )

    client = _client()
    settings = get_settings()

    ext_map = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    ext = ext_map[content_type]
    object_key = f"{prefix.rstrip('/')}/{uuid.uuid4().hex}.{ext}"

    client.upload_fileobj(
        file_obj,
        settings.s3_bucket,
        object_key,
        ExtraArgs={"ContentType": content_type, "CacheControl": "public, max-age=31536000"},
    )
    return StoredObject(object_key=object_key, public_url=_public_url(object_key))


def delete_object(object_key: str | None) -> None:
    """Delete an object from S3. Best-effort; logs and swallows errors."""
    if not object_key:
        return
    settings = get_settings()
    if not settings.s3_bucket:
        return
    try:
        client = _client()
        client.delete_object(Bucket=settings.s3_bucket, Key=object_key)
    except Exception:
        logger.exception("Failed to delete S3 object %s", object_key)
