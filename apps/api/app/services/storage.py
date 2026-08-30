"""Storage backend abstraction for evidence artifacts.

Provides a pluggable interface (`StorageBackend`) with two implementations:
`LocalStorageBackend` (filesystem, for development/testing) and
`S3StorageBackend` (boto3, for production). Callers should obtain a
backend via `get_storage_backend()` rather than instantiating directly,
so the choice is driven by the `STORAGE_BACKEND` setting.
"""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import cast

from app.core.config import get_settings


class StorageBackend(ABC):
    """Abstract interface for evidence artifact storage."""

    @abstractmethod
    async def upload(self, path: str, data: bytes, content_type: str) -> None:
        """Write `data` to `path`, overwriting any existing content."""
        raise NotImplementedError

    @abstractmethod
    async def download(self, path: str) -> bytes:
        """Read and return the bytes stored at `path`."""
        raise NotImplementedError

    @abstractmethod
    async def delete(self, path: str) -> None:
        """Remove the object at `path`. No-op if it does not exist."""
        raise NotImplementedError

    @abstractmethod
    async def exists(self, path: str) -> bool:
        """Return True if an object exists at `path`."""
        raise NotImplementedError


class LocalStorageBackend(StorageBackend):
    """Filesystem-backed storage rooted at `STORAGE_LOCAL_PATH`."""

    def __init__(self, base_path: str) -> None:
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _resolve(self, path: str) -> Path:
        # Prevent path traversal outside the storage root.
        candidate = (self.base_path / path).resolve()
        base_resolved = self.base_path.resolve()
        if base_resolved not in candidate.parents and candidate != base_resolved:
            raise ValueError(f"Path '{path}' escapes the storage root.")
        return candidate

    async def upload(self, path: str, data: bytes, content_type: str) -> None:
        target = self._resolve(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    async def download(self, path: str) -> bytes:
        target = self._resolve(path)
        if not target.exists():
            raise FileNotFoundError(f"No object at path '{path}'.")
        return target.read_bytes()

    async def delete(self, path: str) -> None:
        target = self._resolve(path)
        if target.exists():
            target.unlink()

    async def exists(self, path: str) -> bool:
        return self._resolve(path).exists()


class S3StorageBackend(StorageBackend):
    """S3-compatible object storage backend (also works with MinIO via endpoint override)."""

    def __init__(
        self,
        bucket_name: str,
        region: str,
        access_key_id: str,
        secret_access_key: str,
        endpoint_url: str = "",
    ) -> None:
        import boto3  # type: ignore[import-untyped]  # optional SDK

        self.bucket_name = bucket_name
        client_kwargs: dict[str, str] = {"region_name": region}
        if endpoint_url:
            client_kwargs["endpoint_url"] = endpoint_url
        if access_key_id and secret_access_key:
            client_kwargs["aws_access_key_id"] = access_key_id
            client_kwargs["aws_secret_access_key"] = secret_access_key

        self._client = boto3.client("s3", **client_kwargs)

    async def upload(self, path: str, data: bytes, content_type: str) -> None:
        self._client.put_object(
            Bucket=self.bucket_name,
            Key=path,
            Body=data,
            ContentType=content_type or "application/octet-stream",
        )

    async def download(self, path: str) -> bytes:
        from botocore.exceptions import ClientError  # type: ignore[import-untyped]

        try:
            response = self._client.get_object(Bucket=self.bucket_name, Key=path)
        except ClientError as exc:
            raise FileNotFoundError(f"No object at path '{path}'.") from exc
        return cast(bytes, response["Body"].read())

    async def delete(self, path: str) -> None:
        self._client.delete_object(Bucket=self.bucket_name, Key=path)

    async def exists(self, path: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self._client.head_object(Bucket=self.bucket_name, Key=path)
            return True
        except ClientError:
            return False


_backend_singleton: StorageBackend | None = None


def get_storage_backend() -> StorageBackend:
    """Factory returning the configured storage backend.

    Reads `STORAGE_BACKEND` ("local" or "s3") and the associated settings
    to construct the appropriate implementation. Cached as a module-level
    singleton so repeated calls (e.g. per-request Depends) reuse the same
    client/connection.
    """
    global _backend_singleton
    if _backend_singleton is not None:
        return _backend_singleton

    settings = get_settings()

    if settings.storage_backend == "s3":
        _backend_singleton = S3StorageBackend(
            bucket_name=settings.s3_bucket_name,
            region=settings.s3_region,
            access_key_id=settings.s3_access_key_id,
            secret_access_key=settings.s3_secret_access_key,
            endpoint_url=settings.s3_endpoint_url,
        )
    else:
        _backend_singleton = LocalStorageBackend(settings.storage_local_path)

    return _backend_singleton


def reset_storage_backend() -> None:
    """Reset the cached backend singleton. Primarily useful for tests."""
    global _backend_singleton
    _backend_singleton = None
