"""Instagram HTTP routes."""

import asyncio
from typing import Any, Dict, List

from fastapi import APIRouter, Query
from pydantic import BaseModel

from api.responses import ALApiResponse, join_errors
from config import INSTAGRAM_API

from .helpers import (
    open_signup_page,
    scrape_instagram_profiles,
    scrape_single_profile,
    validate_and_normalize_inputs,
)

router = APIRouter(tags=["instagram"])


class InstagramProfilesRequest(BaseModel):
    """Request body for Instagram profiles scraping."""

    inputs: List[str]


@router.post(
    INSTAGRAM_API.PROFILES,
    response_model=ALApiResponse[List[Any]],
)
async def instagram_profiles(payload: InstagramProfilesRequest):
    """
    Scrape Instagram profile details.

    Accepts JSON body:
    ```json
    { "inputs": ["https://www.instagram.com/user1/", "user2", "@user3"] }
    ```
    """
    print("scraper: [Instagram API] Inputs:", payload.inputs)

    input_list = [inp.strip() for inp in payload.inputs if inp.strip()]

    if not input_list:
        return ALApiResponse[List[Any]](
            success=False,
            data=[],
            error="No valid inputs provided",
        )

    result = scrape_instagram_profiles({"inputs": input_list})
    return ALApiResponse[List[Any]](
        success=result.get("success", False),
        data=result.get("data", []),
        error=join_errors(result.get("error")),
    )


@router.get(
    INSTAGRAM_API.PROFILE,
    response_model=ALApiResponse[Any],
)
async def instagram_single_profile(
    input: str = Query(..., description="Instagram URL or username"),
):
    """
    Scrape a single Instagram profile.

    Example: ``/api/instagram/profile?input=johndoe``
    """
    result = scrape_single_profile(input.strip())
    return ALApiResponse[Any](
        success=result.get("success", False),
        data=result.get("data"),
        error=join_errors(result.get("error")),
    )


@router.post(
    INSTAGRAM_API.OPEN_SIGNUP,
    response_model=ALApiResponse[Dict[str, Any]],
)
async def instagram_open_signup():
    """
    [Testing] Opens the Instagram email signup page in a browser.
    The browser opens on the machine where the scraper service is running.
    """
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: open_signup_page({}))
        return ALApiResponse[Dict[str, Any]](
            success=result.get("success", False),
            data=result,
            error=None,
        )
    except Exception as e:
        return ALApiResponse[Dict[str, Any]](
            success=False,
            data=None,
            error=str(e),
        )


@router.get(
    INSTAGRAM_API.VALIDATE,
    response_model=ALApiResponse[Dict[str, Any]],
)
async def instagram_validate(
    inputs: str = Query(
        ...,
        description="Comma-separated list of Instagram URLs or usernames to validate",
    ),
):
    """
    Validate Instagram URLs/usernames without scraping.

    Example: ``/api/instagram/validate?inputs=johndoe,https://instagram.com/janedoe/``
    """
    input_list = [inp.strip() for inp in inputs.split(",") if inp.strip()]

    if not input_list:
        return ALApiResponse[Dict[str, Any]](
            success=False,
            data={"valid": [], "invalid": []},
            error="No inputs provided",
        )

    valid_inputs, invalid_inputs = validate_and_normalize_inputs(input_list)

    errors = [inp.error or f"Invalid: {inp.original}" for inp in invalid_inputs]

    return ALApiResponse[Dict[str, Any]](
        success=True,
        data={
            "valid": [
                {
                    "original": inp.original,
                    "username": inp.username,
                    "profile_url": inp.profileUrl,
                }
                for inp in valid_inputs
            ],
            "invalid": [
                {
                    "original": inp.original,
                    "error": inp.error or "Invalid input",
                }
                for inp in invalid_inputs
            ],
        },
        error=join_errors(errors),
    )
