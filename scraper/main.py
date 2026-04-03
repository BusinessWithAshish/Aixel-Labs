"""
Scraper Service - FastAPI server using Botasaurus for web scraping.

Provides APIs for:
- Google search link extraction
- Instagram profile scraping

All JSON envelopes use ``ALApiResponse`` (see ``api/responses.py``), aligned with the backend.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.google_search import router as google_search_router
from api.health import router as health_router
from api.instagram import router as instagram_router
from config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting scraper service on {settings.HOST}:{settings.PORT}")
    yield
    print("Shutting down scraper service...")


app = FastAPI(
    title="Scraper Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(health_router)
app.include_router(google_search_router)
app.include_router(instagram_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
