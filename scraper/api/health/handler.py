"""Health check route."""

from fastapi import APIRouter
from pydantic import BaseModel

from config import HEALTH_API

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    service: str


@router.get(HEALTH_API.CHECK, response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    return HealthResponse(status="healthy", service="scraper")
