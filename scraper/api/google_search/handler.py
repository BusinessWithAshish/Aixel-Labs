"""Google search HTTP routes."""

from enum import Enum
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.responses import ALApiResponse, join_errors
from config import GOOGLE_SEARCH_API

from .helpers import scrape_google_links

router = APIRouter(tags=["google"])


class TimeFilter(str, Enum):
    past_day   = "qdr:d"
    past_week  = "qdr:w"
    past_month = "qdr:m"
    past_year  = "qdr:y"

# GSEARCH API REQUEST SCHEMA
class GSearchRequest(BaseModel):
    query:        str                  = Field(..., description="Raw advanced query e.g. 'site:instagram.com cafe'")
    country_code: str                  = Field(..., description="ISO2 e.g. 'IN', 'CH'")
    near:         Optional[str]        = Field(None, description="City / locality for geo-targeting e.g. 'Pune'")
    max_results:  int                  = Field(10, ge=1, le=100)
    time_filter:  Optional[TimeFilter] = None

class GSearchResultItem(BaseModel):
    url:      Optional[str] = None
    title:    Optional[str] = None
    snippet:  Optional[str] = None
    position: Optional[int] = None

@router.post(
    GOOGLE_SEARCH_API.SCRAPE,
    response_model=ALApiResponse[List[GSearchResultItem]],
)
async def scrape(req: GSearchRequest):
    q = (req.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Query is required")
    if len(q) > 1900:
        raise HTTPException(status_code=400, detail="Max query chars exceeded")

    # GOOGLE API QUERY PARAMS
    query_params = {
        "query":        q,
        "country_code": req.country_code,
        "near":         (req.near or "").strip() or None,
        "time_filter":  req.time_filter.value if req.time_filter else None,
        "max_results":  req.max_results,
    }

    result = scrape_google_links(query_params)
    items = [
        GSearchResultItem(
            url=item.get("url") if isinstance(item, dict) else item,
            title=item.get("title") if isinstance(item, dict) else None,
            snippet=item.get("snippet") if isinstance(item, dict) else None,
            position=i,
        )
        for i, item in enumerate(result.get("data") or [])
    ]
    return ALApiResponse[List[GSearchResultItem]](
        success=result.get("success", False),
        data=items,
        error=join_errors(result.get("error")),
    )