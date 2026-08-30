"""File storage for images/documents.

Uses S3 (or S3-compatible) when `S3_BUCKET` is set and AWS credentials are
available. Otherwise falls back to a local `uploads/` directory served at
`/uploads/...` so local development works without AWS.
"""
from __future__ import annotations

import logging
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
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

_DOCUMENT_EXT = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/plain": "txt",
    "text/csv": "csv",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def local_upload_root() -> Path:
    settings = get_settings()
    root = Path(settings.local_upload_dir)
    if not root.is_absolute():
        repo = Path(__file__).resolve().parent.parent
        root = (repo / root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _s3_credentials_available() -> bool:
    try:
        import boto3
    except ImportError:
        return False
    try:
        creds = boto3.Session().get_credentials()
        return creds is not None and creds.get_frozen_credentials().access_key is not None
    except Exception:
        return False


def uses_local_storage() -> bool:
    """True when uploads should go to disk (no bucket, or no usable AWS creds)."""
    settings = get_settings()
    if not settings.s3_bucket:
        return True
    if not _s3_credentials_available():
        return True
    return False


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


def _public_url(object_key: str, *, local: bool) -> str:
    settings = get_settings()
    if local:
        base = settings.api_public_base_url.rstrip("/")
        return f"{base}/uploads/{object_key}"
    if settings.s3_public_base_url:
        base = settings.s3_public_base_url.rstrip("/")
        return f"{base}/{object_key}"
    if settings.s3_endpoint_url:
        return f"{settings.s3_endpoint_url.rstrip('/')}/{settings.s3_bucket}/{object_key}"
    region = settings.s3_region or "us-east-1"
    return f"https://{settings.s3_bucket}.s3.{region}.amazonaws.com/{object_key}"


def _store_local(
    file_obj: BinaryIO,
    *,
    object_key: str,
) -> StoredObject:
    dest = local_upload_root() / object_key
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as out:
        shutil.copyfileobj(file_obj, out)
    return StoredObject(object_key=object_key, public_url=_public_url(object_key, local=True))


def _store(
    file_obj: BinaryIO,
    *,
    object_key: str,
    content_type: str,
    original_filename: str | None = None,
    cache_control: str,
) -> StoredObject:
    settings = get_settings()
    if uses_local_storage():
        if settings.s3_bucket and not _s3_credentials_available():
            logger.warning(
                "S3_BUCKET is set but AWS credentials are missing; "
                "storing uploads under %s",
                local_upload_root(),
            )
        return _store_local(file_obj, object_key=object_key)

    client = _client()
    extra: dict = {"ContentType": content_type, "CacheControl": cache_control}
    if original_filename:
        extra["ContentDisposition"] = f'inline; filename="{original_filename}"'
    try:
        client.upload_fileobj(file_obj, settings.s3_bucket, object_key, ExtraArgs=extra)
    except Exception as e:
        # Local fallback only when no credentials were even available to attempt
        # the request. ClientError means AWS responded (bad bucket, permission
        # denied, throttled, ...) — a real misconfiguration that must surface
        # loudly rather than silently landing on ephemeral local disk.
        name = type(e).__name__
        if name in {"NoCredentialsError", "PartialCredentialsError"}:
            logger.warning("S3 upload failed (%s); falling back to local storage", name)
            # file_obj may have been partially consumed — rewind if possible
            if hasattr(file_obj, "seek"):
                try:
                    file_obj.seek(0)
                except Exception:
                    pass
            return _store_local(file_obj, object_key=object_key)
        raise
    return StoredObject(object_key=object_key, public_url=_public_url(object_key, local=False))


def upload_image(
    file_obj: BinaryIO,
    *,
    content_type: str,
    prefix: str,
    original_filename: str | None = None,
) -> StoredObject:
    """Upload a file-like under `prefix/<uuid>.<ext>`. Returns key + URL."""
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise ValueError(
            f"Unsupported image type {content_type}. Allowed: jpeg, png, webp, gif."
        )

    ext_map = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    ext = ext_map[content_type]
    object_key = f"{prefix.rstrip('/')}/{uuid.uuid4().hex}.{ext}"
    return _store(
        file_obj,
        object_key=object_key,
        content_type=content_type,
        original_filename=original_filename,
        cache_control="public, max-age=31536000",
    )


def upload_document(
    file_obj: BinaryIO,
    *,
    content_type: str,
    prefix: str,
    original_filename: str | None = None,
) -> StoredObject:
    """Upload a document (pdf/doc/xls/txt/csv/scanned image)."""
    if content_type not in _DOCUMENT_EXT:
        raise ValueError(
            f"Unsupported document type {content_type}. "
            "Allowed: pdf, doc(x), xls(x), txt, csv, jpeg, png, webp."
        )
    ext = _DOCUMENT_EXT[content_type]
    object_key = f"{prefix.rstrip('/')}/{uuid.uuid4().hex}.{ext}"
    return _store(
        file_obj,
        object_key=object_key,
        content_type=content_type,
        original_filename=original_filename,
        cache_control="private, max-age=3600",
    )


def delete_object(object_key: str | None) -> None:
    """Delete a stored object. Best-effort; logs and swallows errors."""
    if not object_key:
        return
    try:
        local_path = local_upload_root() / object_key
        if local_path.is_file():
            local_path.unlink()
            return
        if uses_local_storage():
            return
        client = _client()
        settings = get_settings()
        client.delete_object(Bucket=settings.s3_bucket, Key=object_key)
    except StorageNotConfigured:
        return
    except Exception:
        logger.exception("Failed to delete object %s", object_key)
