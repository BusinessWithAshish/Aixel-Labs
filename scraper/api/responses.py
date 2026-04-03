"""Shared API envelope matching backend `ALApiResponse<T>`."""

from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ALApiResponse(BaseModel, Generic[T]):
    """Aligned with `backend/src/api/types.ts` ALApiResponse."""

    model_config = ConfigDict(extra="forbid")

    success: bool
    error: Optional[str] = None
    data: Optional[T] = None


def join_errors(errs: Optional[list]) -> Optional[str]:
    if not errs:
        return None
    parts = [str(e) for e in errs if e is not None and str(e)]
    return "; ".join(parts) if parts else None
