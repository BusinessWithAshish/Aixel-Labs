"""
Configuration management for the scraper service.
Loads settings from environment variables with sensible defaults.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Union
from urllib.parse import quote
from dotenv import load_dotenv

# Load scraper/.env regardless of process cwd (e.g. uvicorn started from repo root)
_SCRAPER_ROOT = Path(__file__).resolve().parent
load_dotenv(_SCRAPER_ROOT / ".env")
load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    # Server settings
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    @property
    def cors_origins(self) -> list[str]:
        """Browser origins allowed to call this API (CORS)."""
        if self.DEBUG:
            return ["http://localhost:8003"]
        return ["https://api.aixellabs.com"]

    # Scraping settings
    HEADLESS: bool = os.getenv("HEADLESS", "true").lower() == "true"
    MAX_RETRIES: int = int(os.getenv("MAX_RETRIES", "3"))

    # Proxy settings (optional)
    PROXY_URL: Optional[str] = os.getenv("PROXY_URL", None)

    # Evomi residential (same env names as backend). Used by Instagram browser scraper.
    EVOMI_PROXY_USERNAME: Optional[str] = os.getenv("EVOMI_PROXY_USERNAME")
    EVOMI_PROXY_PASSWORD: Optional[str] = os.getenv("EVOMI_PROXY_PASSWORD")
    EVOMI_PROXY_HOST: Optional[str] = os.getenv("EVOMI_PROXY_HOST")
    EVOMI_PROXY_PORT: Optional[str] = os.getenv("EVOMI_PROXY_PORT")

    # Request timeout in seconds
    REQUEST_TIMEOUT: int = int(os.getenv("REQUEST_TIMEOUT", "30"))

    def evomi_proxy_url(self, country_code: Optional[str] = None) -> Optional[str]:
        user = self.EVOMI_PROXY_USERNAME
        password_base = self.EVOMI_PROXY_PASSWORD
        host = self.EVOMI_PROXY_HOST
        port = self.EVOMI_PROXY_PORT
        if not all((user, password_base, host, port)):
            return None
        assert user is not None and password_base is not None
        assert host is not None and port is not None

        password: str = password_base
        if country_code:
            cc = country_code.strip()
            if cc:
                # Evomi expects suffix like _country-IN (preserve upper-case)
                password = f"{password}_country-{cc.upper()}"

        return (
            f"http://{quote(user, safe='')}:"
            f"{quote(password, safe='')}@{host}:{port}"
        )

    def gsearch_browser_proxy_url(self, country_code: Optional[str] = None) -> Optional[str]:
        direct = (self.PROXY_URL or "").strip()
        if direct:
            return direct  # PROXY_URL overrides everything, no country suffix
        return self.evomi_proxy_url(country_code=country_code)


settings = Settings()


# -----------------------------------------------------------------------------
# HTTP routes (mirrors backend ``config.ts`` API_ENDPOINTS style: one object per
# handler with named paths and a ``urls`` list for discovery / docs / clients).
# -----------------------------------------------------------------------------


@dataclass(frozen=True)
class HealthApi:
    """Paths for ``api/health``."""

    CHECK: str = "/health"

    @property
    def urls(self) -> list[str]:
        return [self.CHECK]


@dataclass(frozen=True)
class GoogleSearchApi:
    """Paths for ``api/google_search``."""

    SCRAPE: str = "/api/search"

    @property
    def urls(self) -> list[str]:
        return [self.SCRAPE]


@dataclass(frozen=True)
class InstagramApi:
    """Paths for ``api/instagram``."""

    PROFILES: str = "/api/instagram/profiles"
    PROFILE: str = "/api/instagram/profile"
    OPEN_SIGNUP: str = "/api/instagram/open-signup"
    VALIDATE: str = "/api/instagram/validate"

    @property
    def urls(self) -> list[str]:
        return [
            self.PROFILES,
            self.PROFILE,
            self.OPEN_SIGNUP,
            self.VALIDATE,
        ]


HEALTH_API = HealthApi()
GOOGLE_SEARCH_API = GoogleSearchApi()
INSTAGRAM_API = InstagramApi()

SCRAPER_API_ENDPOINTS: dict[str, Union[HealthApi, GoogleSearchApi, InstagramApi]] = {
    "HEALTH": HEALTH_API,
    "GOOGLE_SEARCH": GOOGLE_SEARCH_API,
    "INSTAGRAM": INSTAGRAM_API,
}
