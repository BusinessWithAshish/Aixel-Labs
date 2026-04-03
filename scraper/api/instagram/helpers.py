"""
Instagram scraping and URL helpers used by ``handler`` routes.

Sections (in order): URL/username validation, profile intercept scraper, signup test flow.
"""

from __future__ import annotations

import json
import random
import re
import time
from dataclasses import asdict, dataclass
from typing import Any, List, Optional, Tuple

from botasaurus.browser import browser, Driver

from config import settings

# --- URL / username validation (formerly ``utils/instagram_utils``) ---

# Instagram URL patterns
INSTAGRAM_PROFILE_URL_REGEX = re.compile(
    r"^https?://(www\.)?instagram\.com/([a-zA-Z0-9_.]+)/?$"
)

# Valid Instagram username pattern (3-30 chars, alphanumeric, underscores, periods)
INSTAGRAM_USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9_.]{1,30}$")

# Reserved/invalid Instagram paths that are NOT usernames
INSTAGRAM_RESERVED_PATHS = {
    "explore",
    "reel",
    "reels",
    "stories",
    "p",
    "tv",
    "direct",
    "accounts",
    "about",
    "legal",
    "api",
    "developer",
    "blog",
    "help",
    "privacy",
    "safety",
    "download",
    "emails",
    "locations",
    "nametag",
    "session",
    "settings",
    "tags",
    "web",
}

INSTAGRAM_BASE_URL = "https://www.instagram.com"


@dataclass
class InstagramInput:
    """Represents a validated Instagram input."""

    original: str
    username: str
    profileUrl: str
    isValid: bool
    error: Optional[str] = None


def extract_username_from_url(url: str) -> Optional[str]:
    """
    Extract username from an Instagram URL.

    Examples:
        https://www.instagram.com/username/ -> username
        https://instagram.com/username -> username
        http://www.instagram.com/username/ -> username

    Returns:
        Username if valid Instagram profile URL, None otherwise.
    """
    match = INSTAGRAM_PROFILE_URL_REGEX.match(url.strip())
    if match:
        username = match.group(2)
        # Filter out reserved paths
        if username.lower() not in INSTAGRAM_RESERVED_PATHS:
            return username
    return None


def is_valid_username(username: str) -> bool:
    """
    Check if a string is a valid Instagram username.

    Instagram usernames:
    - 1-30 characters
    - Can contain letters, numbers, underscores, and periods
    - Cannot be a reserved path
    """
    if not username:
        return False

    username = username.strip().lower()

    if username in INSTAGRAM_RESERVED_PATHS:
        return False

    return bool(INSTAGRAM_USERNAME_REGEX.match(username))


def normalize_to_username(input_str: str) -> Optional[str]:
    """
    Normalize any input format to a username.

    Handles:
    - Full URLs
    - Partial URLs
    - Just usernames
    - Usernames with @ prefix

    Returns:
        Normalized username or None if invalid.
    """
    input_str = input_str.strip()

    if not input_str:
        return None

    # Remove @ prefix if present
    if input_str.startswith("@"):
        input_str = input_str[1:]

    # Check if it's a URL
    if "instagram.com" in input_str.lower():
        return extract_username_from_url(input_str)

    # Treat as username
    if is_valid_username(input_str):
        return input_str

    return None


def username_to_profile_url(username: str) -> str:
    """
    Convert a username to a full Instagram profile URL.

    Args:
        username: Instagram username (without @)

    Returns:
        Full profile URL with trailing slash.
    """
    return f"{INSTAGRAM_BASE_URL}/{username}/"


def validate_and_normalize_inputs(
    inputs: List[str],
) -> Tuple[List[InstagramInput], List[InstagramInput]]:
    """
    Validate and normalize a list of Instagram inputs.

    Args:
        inputs: List of URLs or usernames

    Returns:
        Tuple of (valid_inputs, invalid_inputs)
    """
    valid_inputs = []
    invalid_inputs = []

    for original in inputs:
        username = normalize_to_username(original)

        if username:
            valid_inputs.append(
                InstagramInput(
                    original=original,
                    username=username,
                    profileUrl=username_to_profile_url(username),
                    isValid=True,
                )
            )
        else:
            invalid_inputs.append(
                InstagramInput(
                    original=original,
                    username="",
                    profileUrl="",
                    isValid=False,
                    error=f"Invalid Instagram URL or username: {original}",
                )
            )

    return valid_inputs, invalid_inputs


def dedupe_by_username(inputs: List[InstagramInput]) -> List[InstagramInput]:
    """
    Remove duplicate inputs based on username (case-insensitive).
    Preserves order, keeps first occurrence.
    """
    seen = set()
    unique = []

    for inp in inputs:
        username_lower = inp.username.lower()
        if username_lower not in seen:
            seen.add(username_lower)
            unique.append(inp)

    return unique


# ======================================================================
# Profile scraping (Botasaurus)
# ======================================================================

# Instagram web API triggered when loading a profile page (XHR).
INSTAGRAM_API_URL = "https://www.instagram.com/api/v1/users/web_profile_info/"
INTERCEPT_POLL_SEC = 0.25
INTERCEPT_WAIT_SEC = 90
# CDP can fire ResponseReceived before get_response_body has data; poll for the body.
RESPONSE_BODY_POLL_SEC = 0.15
RESPONSE_BODY_MAX_WAIT_SEC = 25.0


def _web_profile_info_url_match(url: str) -> bool:
    if not url:
        return False
    base = INSTAGRAM_API_URL.rstrip("/")
    return url.startswith(base) or base in url


@dataclass
class InstagramProfileData:
    """Aligned with backend INSTAGRAM_RESPONSE (camelCase keys via asdict)."""

    id: Optional[str] = None
    fullName: Optional[str] = None
    username: Optional[str] = None
    instagramUrl: Optional[str] = None
    websites: Optional[List[str]] = None
    bio: Optional[str] = None
    bioHashtags: Optional[List[str]] = None
    bioMentions: Optional[List[str]] = None
    followers: Optional[int] = None
    following: Optional[int] = None
    posts: Optional[int] = None
    latestPostUrls: Optional[List[str]] = None
    profilePicture: Optional[str] = None
    profilePictureHd: Optional[str] = None
    isVerified: Optional[bool] = None
    isBusiness: Optional[bool] = None
    isProfessional: Optional[bool] = None
    isPrivate: Optional[bool] = None
    isJoinedRecently: Optional[bool] = None
    businessEmail: Optional[str] = None
    businessPhoneNumber: Optional[str] = None
    businessCategoryName: Optional[str] = None
    overallCategoryName: Optional[str] = None
    businessAddressJson: Optional[str] = None


def _parse_profile_response(data: Any, username: str) -> Tuple[Optional[InstagramProfileData], Optional[str]]:
    if data is None:
        return None, f"Empty response for {username}"

    if not isinstance(data, dict):
        return None, f"Invalid response type for {username}"

    if data.get("status") == "fail":
        return None, f"API returned failure for {username}: {data.get('message', 'Unknown error')}"

    user_data = data.get("data")
    if user_data is None:
        return None, f"No data field in response for {username}"

    user = user_data.get("user") if isinstance(user_data, dict) else None
    if user is None:
        return None, f"No user data in response for {username}"

    try:
        bio_with_entities = user.get("biography_with_entities") or {}
        bio_entities = bio_with_entities.get("entities") or []
        bio_hashtags: List[str] = []
        bio_mentions: List[str] = []

        for entity in bio_entities:
            if entity and isinstance(entity, dict):
                hashtag = entity.get("hashtag")
                if hashtag and isinstance(hashtag, dict) and hashtag.get("name"):
                    bio_hashtags.append(hashtag["name"])
                user_entity = entity.get("user")
                if (
                    user_entity
                    and isinstance(user_entity, dict)
                    and user_entity.get("username")
                ):
                    bio_mentions.append(user_entity["username"])

        bio_links = user.get("bio_links") or []
        websites: List[str] = []
        for link in bio_links:
            if link and isinstance(link, dict) and link.get("url"):
                websites.append(link["url"])

        followers_data = user.get("edge_followed_by") or {}
        following_data = user.get("edge_follow") or {}
        posts_data = user.get("edge_owner_to_timeline_media") or {}

        # Latest post URLs: match frontend helper
        latest_posts: List[str] = []
        if isinstance(posts_data, dict):
            edges = posts_data.get("edges") or []
            for edge in edges:
                try:
                    node = (edge or {}).get("node") or {}
                    url = node.get("display_url")
                    if isinstance(url, str) and url:
                        latest_posts.append(url)
                except Exception:
                    continue

        uname = user.get("username") or username
        profile = InstagramProfileData(
            id=user.get("id"),
            username=uname,
            fullName=user.get("full_name"),
            instagramUrl=f"https://www.instagram.com/{uname}/",
            websites=websites if websites else None,
            bio=user.get("biography"),
            bioHashtags=bio_hashtags if bio_hashtags else None,
            bioMentions=bio_mentions if bio_mentions else None,
            followers=followers_data.get("count")
            if isinstance(followers_data, dict)
            else None,
            following=following_data.get("count")
            if isinstance(following_data, dict)
            else None,
            posts=posts_data.get("count") if isinstance(posts_data, dict) else None,
            latestPostUrls=latest_posts or None,
            profilePicture=user.get("profile_pic_url"),
            profilePictureHd=user.get("profile_pic_url_hd"),
            isVerified=user.get("is_verified"),
            isBusiness=user.get("is_business_account"),
            isProfessional=user.get("is_professional_account"),
            isPrivate=user.get("is_private"),
            isJoinedRecently=user.get("if_joined_recently"),
            businessEmail=user.get("business_email"),
            businessPhoneNumber=user.get("business_phone_number"),
            businessCategoryName=user.get("business_category_name"),
            overallCategoryName=user.get("overall_category_name"),
            businessAddressJson=user.get("business_address_json"),
        )

        return profile, None

    except Exception as e:
        return None, f"Error parsing profile for {username}: {str(e)}"


def _collect_web_profile_json(
    driver: Driver, captured_ids: List[str]
) -> Tuple[Any, Optional[str]]:
    """
    Network.getResponseBody often returns no data immediately after ResponseReceived.
    Retry each captured request id with its own time budget (newest ids first).
    """
    if not captured_ids:
        return None, "No captured request ids"

    for rid in reversed(captured_ids):
        rid_deadline = time.time() + RESPONSE_BODY_MAX_WAIT_SEC
        while time.time() < rid_deadline:
            raw = driver.collect_response(rid)
            content = getattr(raw, "content", None)
            if content is not None and content != "":
                try:
                    return raw.get_json_content(), None
                except (ValueError, TypeError) as e:
                    try:
                        decoded = raw.get_decoded_content()
                    except Exception:
                        decoded = None
                    preview = decoded[:240] if decoded else None
                    return None, (
                        f"Invalid JSON in response body: {e} "
                        f"preview={preview!r}"
                    )
            driver.sleep(RESPONSE_BODY_POLL_SEC)

    return None, (
        "Response body never became available (timed out). "
        "Try again on a slow proxy, or Instagram returned an empty body for this request."
    )


def _scrape_single_profile_intercept_impl(driver: Driver, data: dict) -> dict:
    """
    Botasaurus task: intercept web_profile_info JSON from a direct profile navigation.
    """
    profile_url = (data.get("profile_url") or "").strip()
    username = (data.get("username") or "").strip()

    if not profile_url or not username:
        return {
            "success": False,
            "data": None,
            "error": ["profile_url and username are required"],
        }

    captured_ids: List[str] = []

    def on_response(request_id: str, response, event) -> None:
        try:
            url = getattr(response, "url", None) or ""
            status = int(getattr(response, "status", 0) or 0)
        except Exception:
            return
        if status != 200:
            return
        if not _web_profile_info_url_match(url):
            return
        captured_ids.append(request_id)

    try:
        driver.after_response_received(on_response)
        driver.sleep(random.uniform(0.3, 0.8))
        driver.get(
            profile_url,
            wait=4,
            timeout=max(90, settings.REQUEST_TIMEOUT),
        )

        deadline = time.time() + INTERCEPT_WAIT_SEC
        while time.time() < deadline and not captured_ids:
            driver.sleep(INTERCEPT_POLL_SEC)

        if not captured_ids:
            snippet = ""
            try:
                snippet = (driver.page_text or "")[:800]
            except Exception:
                pass
            return {
                "success": False,
                "data": None,
                "error": [
                    "Timed out waiting for web_profile_info response. "
                    f"current_url={getattr(driver, 'current_url', '')!r} page_snippet={snippet!r}"
                ],
            }

        grace = time.time() + 6.0
        n0 = len(captured_ids)
        while time.time() < grace:
            driver.sleep(INTERCEPT_POLL_SEC)
            if len(captured_ids) > n0:
                n0 = len(captured_ids)
                grace = time.time() + 4.0

        payload, collect_err = _collect_web_profile_json(driver, captured_ids)
        if collect_err or payload is None:
            return {
                "success": False,
                "data": None,
                "error": [collect_err or "Empty intercepted payload"],
            }

        # Debug log: raw Instagram web_profile_info payload per username
        try:
            preview = json.dumps(payload)[:2000]
        except Exception:
            preview = str(payload)[:2000]
        print(f"[instagram] web_profile_info payload for {username}: {preview}")

        profile, err = _parse_profile_response(payload, username)
        
        if profile and profile.id:
            return {
                "success": True,
                "data": asdict(profile),
                "error": [],
            }
        return {
            "success": False,
            "data": None,
            "error": [err or "Parse failed or missing profile id"],
        }

    except Exception as e:
        return {"success": False, "data": None, "error": [str(e)]}


def _run_intercept_browser(data: dict) -> dict:
    proxy_url = settings.evomi_proxy_url()
    u, h, pt = (
        settings.EVOMI_PROXY_USERNAME,
        settings.EVOMI_PROXY_HOST,
        settings.EVOMI_PROXY_PORT,
    )
    print(
        f"[instagram] evomi_proxy host={h!r} port={pt!r} user_set={bool(u)} "
        f"-> browser_proxy={'yes' if proxy_url else 'NO (missing env)'}"
    )
    if not proxy_url:
        return {
            "success": False,
            "data": None,
            "error": [
                "Evomi proxy not configured. Set EVOMI_PROXY_USERNAME, "
                "EVOMI_PROXY_PASSWORD, EVOMI_PROXY_HOST, EVOMI_PROXY_PORT (e.g. in scraper/.env)."
            ],
        }

    browser_kwargs = dict(
        headless=settings.HEADLESS,
        block_images=True,
        reuse_driver=False,
        wait_for_complete_page_load=True,
        output=None,
        proxy=proxy_url,
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        add_arguments=[
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-first-run",
            "--no-service-autorun",
            "--password-store=basic",
            "--disable-infobars",
            f"--window-size={random.randint(1100, 1400)},{random.randint(700, 900)}",
        ],
    )

    task = browser(**browser_kwargs)(_scrape_single_profile_intercept_impl)
    return task(data)


def scrape_instagram_profiles(data: dict) -> dict:
    """
    Scrape Instagram profiles (one browser session per profile).

    Accepts:
        inputs: List[str] — URLs, @user, or plain usernames.

    Returns:
        { success: bool, data: List[dict], error: List[str] }
    """
    inputs = data.get("inputs", [])

    if not inputs:
        return {"success": False, "data": [], "error": ["No inputs provided"]}

    all_errors: List[str] = []

    print(f"📥 Received {len(inputs)} inputs")
    valid_inputs, invalid_inputs = validate_and_normalize_inputs(inputs)
    valid_inputs = dedupe_by_username(valid_inputs)

    print(f"✅ Valid inputs: {len(valid_inputs)}")
    print(f"❌ Invalid inputs: {len(invalid_inputs)}")

    for inv in invalid_inputs:
        all_errors.append(inv.error or f"Invalid input: {inv.original}")

    if not valid_inputs:
        return {
            "success": False,
            "data": [],
            "error": all_errors
            if all_errors
            else ["No valid Instagram URLs or usernames found"],
        }

    profiles: List[dict] = []

    for inp in valid_inputs:
        print(f"\n🔐 Intercept scrape: {inp.username} ({inp.profileUrl})")
        result = _run_intercept_browser(
            {"profile_url": inp.profileUrl, "username": inp.username}
        )
        if result.get("success") and result.get("data"):
            profiles.append(result["data"])
        else:
            errs = result.get("error") or ["Unknown error"]
            all_errors.extend(errs)

        if len(valid_inputs) > 1:
            time.sleep(random.uniform(1.2, 2.5))

    return {
        "success": len(profiles) > 0,
        "data": profiles,
        "error": all_errors if all_errors else [],
    }


def scrape_single_profile(input_str: str) -> dict:
    result = scrape_instagram_profiles({"inputs": [input_str]})

    if result["success"] and result["data"]:
        return {
            "success": True,
            "data": result["data"][0],
            "error": result.get("error", []),
        }

    return {
        "success": False,
        "data": None,
        "error": result.get("error", ["Failed to fetch profile"]),
    }


# ======================================================================
# Signup page opener (testing)
# ======================================================================

INSTAGRAM_SIGNUP_URL = "https://www.instagram.com/accounts/emailsignup/"
TEMP_MAIL_URL = "https://temp-mail.org/en/"
TEMP_MAIL_MAILBOX_URL = "https://web2.temp-mail.org/mailbox"
TEMP_MAIL_WAIT_TIMEOUT = 15
TEMP_MAIL_POLL_INTERVAL = 1.5
TEMP_MAIL_EMAIL_SELECTOR = "#mail"
TEMP_MAIL_MAX_RETRIES = 3


def _get_temp_mail_email(driver: Driver) -> str:
    try:
        el = driver.select(TEMP_MAIL_EMAIL_SELECTOR)
        return (el.get_attribute("value") or "").strip() if el else ""
    except Exception:
        return ""


def _wait_for_temp_email(driver: Driver) -> str:
    for _ in range(int(TEMP_MAIL_WAIT_TIMEOUT / TEMP_MAIL_POLL_INTERVAL)):
        driver.sleep(TEMP_MAIL_POLL_INTERVAL)
        email = _get_temp_mail_email(driver)
        if email and "@" in email:
            return email
    return ""


def _get_temp_mail_from_network(driver: Driver, max_retries: int = TEMP_MAIL_MAX_RETRIES) -> str:
    """
    Try to extract the temp-mail address directly from the mailbox
    XHR response, with a few automatic reload retries.
    """
    for attempt in range(max_retries):
        # Wait (briefly, in small intervals) for at least one mailbox request
        waited = 0.0
        while waited < TEMP_MAIL_WAIT_TIMEOUT and not driver.responses:
            driver.sleep(TEMP_MAIL_POLL_INTERVAL)
            waited += TEMP_MAIL_POLL_INTERVAL

        if not driver.responses:
            # No mailbox request seen; refresh and retry
            driver.responses.clear()
            driver.get(TEMP_MAIL_URL)
            continue

        # Safely collect responses one by one to avoid library bugs
        for request_id in list(driver.responses):
            try:
                resp = driver.collect_response(request_id)
            except Exception:
                continue

            url = (getattr(resp, "url", "") or "")
            if TEMP_MAIL_MAILBOX_URL not in url or not getattr(resp, "content", None):
                continue

            try:
                data = json.loads(resp.content)
            except json.JSONDecodeError:
                continue

            mailbox = (data.get("mailbox") or "").strip()
            # Ignore placeholder values like "Loading.." and ensure it's an email
            if mailbox and mailbox.lower() != "loading.." and "@" in mailbox:
                return mailbox

        # If we reach here, we saw requests but couldn't extract a valid mailbox.
        # Clear and reload for the next attempt.
        driver.responses.clear()
        driver.get(TEMP_MAIL_URL)

    return ""


@browser(headless=settings.HEADLESS, output=None)
def open_signup_page(driver: Driver, data: dict | None = None):
    # Open Instagram signup in the first tab
    driver.get(INSTAGRAM_SIGNUP_URL)

    driver.responses.clear()

    # Track only mailbox requests from the temp-mail tab.
    def after_response_handler(request_id, response, event):
        url = (getattr(response, "url", "") or "")
        if TEMP_MAIL_MAILBOX_URL in url:
            driver.responses.append(request_id)

    driver.after_response_received(after_response_handler)

    # Open temp-mail in a second tab and focus it
    mail_tab = driver.open_link_in_new_tab(TEMP_MAIL_URL)
    driver.switch_to_tab(mail_tab)

    # Prefer the mailbox XHR; fall back to DOM polling only if needed.
    temp_email = _get_temp_mail_from_network(driver)
    if not temp_email:
        temp_email = _get_temp_mail_email(driver) or _wait_for_temp_email(driver)

    return {
        "success": True,
        "temp_email": temp_email or None,
        "insta_tab_focused": True,
    }
