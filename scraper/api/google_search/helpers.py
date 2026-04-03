"""Google Search Scraper using Botasaurus.

Scrapes href links from Google search results with pagination support.
Uses a single browser session for efficiency.
"""

from __future__ import annotations

import math
import random
import time
from typing import Optional
from urllib.parse import parse_qs, unquote, urljoin, urlparse, urlencode

from bs4 import BeautifulSoup
from botasaurus.browser import browser, Driver
from config import settings

GOOGLE_BASE_URL = "https://www.google.com"
MAX_PAGINATION_PAGES = 10
GSEARCH_LOG_PREFIX = "[gsearch]"


class GoogleSearchBlockedError(Exception):
    """Google returned the unusual-traffic / sorry interstitial instead of SERP."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _log(msg: str) -> None:
    print(f"{GSEARCH_LOG_PREFIX} {msg}")


# Chrome flags aligned with ``backend/src/utils/browser.ts`` ``optimisedBrowserArgs``.
# Omitted on purpose (Botasaurus / decorator already cover or conflict):
# - ``--blink-settings=imagesEnabled=false``, ``--disable-images`` — use
#   ``block_images_and_css=True`` on ``@browser`` instead (same effect, no dup).
# - ``--max-old-space-size=4096`` — Node/V8 style; not a standard Chromium switch.
# Merged duplicate ``--disable-features=`` entries from the TS list into one flag.
_GSEARCH_CHROME_ARG_CANDIDATES: tuple[str, ...] = (
    # Stability / sandbox (common in containers)
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-zygote",
    # Stealth (overlap with Botasaurus defaults is OK; we dedupe by switch name)
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--disable-features=IsolateOrigins,site-per-process,TranslateUI",
    # Performance / background traffic (less CPU + fewer background requests)
    "--disable-gpu",
    "--disable-dev-tools",
    "--disable-extensions",
    "--disable-default-apps",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-translate",
    "--disable-hang-monitor",
    "--disable-prompt-on-repost",
    "--disable-client-side-phishing-detection",
    "--disable-component-update",
    "--disable-domain-reliability",
    "--disable-ipc-flooding-protection",
    "--disable-remote-fonts",
    # Display / audio (headless-safe)
    "--start-maximized",
    "--hide-scrollbars",
    "--mute-audio",
    "--memory-pressure-off",
    # Match Instagram scraper hardening
    "--no-service-autorun",
    "--password-store=basic",
    # Useful behind some residential proxies / TLS inspection
    "--ignore-certificate-errors",
    "--ignore-ssl-errors",
    "--allow-running-insecure-content",
)


def _chrome_arg_key(arg: str) -> str:
    """Dedupe Chromium flags: name before first ``=``."""
    arg = arg.strip()
    if arg.startswith("--"):
        return arg.split("=", 1)[0]
    return arg


def _dedupe_chrome_args(args: tuple[str, ...] | list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for a in args:
        key = _chrome_arg_key(a)
        if key in seen:
            continue
        seen.add(key)
        out.append(a)
    return out


def _gsearch_chrome_arguments() -> list[str]:
    """Extra ``add_arguments`` for Google search (deduped; window size varies per run)."""
    base = _dedupe_chrome_args(_GSEARCH_CHROME_ARG_CANDIDATES)
    win = f"--window-size={random.randint(1100, 1400)},{random.randint(700, 900)}"
    # Ensure single --window-size if something else added it later
    return _dedupe_chrome_args([*base, win])


def _gsearch_browser_kwargs(country_code: Optional[str] = None) -> dict:
    """
    Botasaurus options: proxy from config, minimal wait for DOM (saves bandwidth),
    block images/CSS, reuse one driver across pagination.
    """
    proxy_url = settings.gsearch_browser_proxy_url(country_code=country_code)
    u, h, pt = (
        settings.EVOMI_PROXY_USERNAME,
        settings.EVOMI_PROXY_HOST,
        settings.EVOMI_PROXY_PORT,
    )
    has_direct = bool((settings.PROXY_URL or "").strip())
    _log(
        f"browser_proxy={'yes' if proxy_url else 'no'} "
        f"(PROXY_URL={'set' if has_direct else 'unset'}, "
        f"evomi_host={h!r} port={pt!r} user_set={bool(u)})"
    )
    kwargs: dict = {
        "headless": settings.HEADLESS,
        "block_images_and_css": True,
        "reuse_driver": True,
        # Do not wait for every subresource — faster and far less proxy egress
        "wait_for_complete_page_load": False,
        "add_arguments": _gsearch_chrome_arguments(),
        # Botasaurus default writes results to output/*.json; disable for API / prod
        "output": None,
    }
    if proxy_url:
        kwargs["proxy"] = proxy_url
    return kwargs


def google_unusual_traffic_message(driver: Driver) -> str | None:
    """
    Detect Google's bot / rate-limit interstitial, e.g.:

    "Our systems have detected unusual traffic from your computer network..."
    with optional IP mismatch (``≠``) and "Why did this happen?"
    """
    try:
        cur = (driver.current_url or "").lower()
    except Exception:
        cur = ""
    text = ""
    try:
        text = driver.page_text or ""
    except Exception:
        pass
    t = text.lower()
    snippet = text[:4000]

    if "/sorry/" in cur or "sorry/index" in cur:
        return (
            "Google blocked the request (sorry / interstitial page). "
            "Try again later, rotate residential proxy, or slow down requests."
        )

    # Phrases from the standard unusual-traffic page
    traffic_phrases = (
        "our systems have detected unusual traffic",
        "detected unusual traffic from your computer network",
        "unusual traffic from your computer network",
        "unusual traffic from your computer",
    )
    if any(p in t for p in traffic_phrases):
        return (
            "Google detected unusual traffic from this network (bot or rate limit). "
            "Try again later, use a different proxy/IP, or reduce request frequency."
        )

    if "why did this happen?" in t and (
        "unusual traffic" in t or "computer network" in t
    ):
        return (
            "Google unusual-traffic page detected. "
            "Retry later or change proxy; avoid datacenter IPs if possible."
        )

    if "please try your request again later" in t and (
        "traffic" in t or "systems" in t
    ):
        return (
            "Google asked to retry later (likely rate limiting). "
            "Wait before retrying or rotate proxy."
        )

    # IP disclosure block: "IP address: x.x.x.x ≠ y.y.y.y"
    if "ip address:" in t and (
        "≠" in snippet
        or " does not match " in t
        or "not equal" in t
    ):
        return (
            "Google unusual-traffic page (IP / network mismatch). "
            "Use a consistent residential proxy or wait before retrying."
        )

    return None


# normalize_google_search_target — add geo params
def normalize_google_search_target(
    query: str,
    *,
    country_code: str = "us",
    near: Optional[str] = None,
    time_filter: Optional[str] = None,
) -> str:
    s = (query or "").strip()
    if not s:
        return s

    # Append "in {near}" to the query so Google ties results to the city
    if near:
        s = f"{s} in {near}"

    query_params: dict = {
        "q":      s,
        "gl":     country_code.lower(),
        "hl":     "en",
        "filter": "0",
        "nfpr":   "1",
        "pws":    "0",   # strip personalisation → more neutral / location-driven results
        "udm":    "14",  # web results only, no AI Overview padding
    }
    if near:
        query_params["near"] = near
    if time_filter:
        query_params["tbs"] = time_filter

    encoded = urlencode(query_params, doseq=True)
    return f"{GOOGLE_BASE_URL}/search?{encoded}"


def unwrap_google_redirect(href: str) -> str:
    """
    Resolve Google tracking URLs to real destinations.
    Organic results often use /url?q=https://... which fails is_valid_url()
    when the href is relative (starts with /url?...).
    """
    if not href:
        return ""
    original = href.strip()
    try:
        resolved = original
        if resolved.startswith("/url"):
            resolved = urljoin(GOOGLE_BASE_URL + "/", resolved.lstrip("/"))
        parsed = urlparse(resolved)
        host = (parsed.netloc or "").lower()
        if "google." not in host:
            return original
        path = (parsed.path or "").rstrip("/")
        if path != "/url":
            return original
        qs = parse_qs(parsed.query).get("q")
        q = qs[0] if qs else None
        if q:
            return unquote(q)
    except Exception as e:
        _log(f"unwrap_google_redirect error for {original!r}: {e}")
    return original


def collect_serp_diagnostics(driver: Driver, *, sample_hrefs: list | None = None) -> dict:
    """
    Best-effort signals for empty results: blocking, CAPTCHA, consent, DOM shape.
    """
    diag: dict = {"sample_raw_hrefs": sample_hrefs or []}
    try:
        diag["current_url"] = driver.current_url
    except Exception as e:
        diag["current_url"] = f"<error: {e}>"
    try:
        diag["title"] = driver.title
    except Exception as e:
        diag["title"] = f"<error: {e}>"
    try:
        diag["is_bot_detected"] = driver.is_bot_detected()
    except Exception as e:
        diag["is_bot_detected"] = f"<error: {e}>"
    try:
        diag["bot_detected_by"] = driver.get_bot_detected_by()
    except Exception as e:
        diag["bot_detected_by"] = f"<error: {e}>"
    text = ""
    try:
        text = (driver.page_text or "")[:12000].lower()
    except Exception as e:
        diag["page_text_error"] = str(e)
    cur = diag.get("current_url") or ""
    diag["signals"] = {
        "stuck_on_internal_chrome": cur.startswith("chrome://")
        or cur.startswith("about:"),
        "sorry_or_unusual": "/sorry/" in cur
        or "unusual traffic" in text
        or "detected unusual traffic" in text
        or "our systems have detected unusual traffic" in text
        or "why did this happen?" in text
        or ("ip address:" in text and "≠" in text),
        "captcha": "captcha" in text
        or "recaptcha" in text
        or "g-recaptcha" in text,
        "consent": "before you continue" in text
        or "consent.google.com" in cur
        or ("cookie" in text and "consent" in text),
        "no_results_phrase": "did not match any documents" in text
        or "no results found" in text,
    }
    try:
        diag["has_div_search"] = driver.is_element_present("div#search")
    except Exception:
        diag["has_div_search"] = "unknown"
    try:
        divs = driver.select_all('div[data-async-context*="query:"]')
        diag["count_async_query_divs"] = len(divs) if divs else 0
    except Exception as e:
        diag["count_async_query_divs"] = f"<error: {e}>"
    try:
        search_anchors = driver.select_all("div#search a")
        diag["count_search_anchors"] = len(search_anchors) if search_anchors else 0
    except Exception as e:
        diag["count_search_anchors"] = f"<error: {e}>"
    return diag


def log_serp_diagnostics(label: str, diag: dict) -> None:
    _log(f"--- diagnostics ({label}) ---")
    for k, v in diag.items():
        if k == "sample_raw_hrefs":
            _log(f"  sample_raw_hrefs (first 12): {v[:12]!r}")
            continue
        _log(f"  {k}: {v}")


def is_valid_url(href: str) -> bool:
    """
    Check if URL is valid (not a meta URL with text fragments).
    Filters out URLs like: https://example.com/#:~:text=...
    """
    if not href:
        return False
    if not href.startswith("http"):
        return False
    if "#:~:text=" in href:
        return False
    return True


def _is_external_href(href: str) -> bool:
    if not href or not href.startswith("http"):
        return False
    if href.startswith("https://www.google.") or href.startswith("https://google."):
        return False
    return True


def _snippet_from_node(start_node) -> str | None:
    """
    Try to find the snippet container (Google often uses div.VwiC3b) by walking up
    the DOM tree from a result anchor/title.
    """
    node = getattr(start_node, "parent", None)
    hops = 0
    while node is not None and hops < 12:
        snip = node.select_one("div.VwiC3b")
        if snip:
            text = snip.get_text(" ", strip=True)
            return text or None
        if getattr(node, "get", None) and node.get("id") == "rso":
            break
        node = getattr(node, "parent", None)
        hops += 1
    return None


def extract_cards_from_soup(soup: BeautifulSoup) -> list[dict]:
    """
    Extract organic-like cards from a SERP HTML document.
    Pattern A: <a href="http..."><h3>title</h3></a>
    Pattern B: <h3> with sibling <a href="http..."> under same parent
    """
    results: list[dict] = []
    seen: set[str] = set()

    # Pattern A
    for a in soup.select("a[href]"):
        h3 = a.select_one("h3")
        if not h3:
            continue
        href = str(a.get("href") or "").strip()
        if not _is_external_href(href):
            continue
        url = unwrap_google_redirect(href)
        if not is_valid_url(url) or url in seen:
            continue
        seen.add(url)
        results.append(
            {
                "url": url,
                "title": (h3.get_text(" ", strip=True) or None),
                "snippet": _snippet_from_node(a),
            }
        )

    # Pattern B
    for h3 in soup.select("h3"):
        # Skip if inside an <a> (already captured by Pattern A)
        if h3.find_parent("a", href=True):
            continue
        parent = h3.parent
        if not parent:
            continue
        for a in parent.select("a[href]"):
            href = str(a.get("href") or "").strip()
            if not _is_external_href(href):
                continue
            url = unwrap_google_redirect(href)
            if not is_valid_url(url) or url in seen:
                continue
            seen.add(url)
            results.append(
                {
                    "url": url,
                    "title": (h3.get_text(" ", strip=True) or None),
                    "snippet": _snippet_from_node(h3),
                }
            )
            break

    return results


def extract_cards_from_live_dom(driver: Driver) -> list[dict]:
    """
    Page 1 extraction using live DOM selectors (no JS execution).
    """
    try:
        html = driver.page_html or ""
        soup = BeautifulSoup(html, "html.parser")
        return extract_cards_from_soup(soup)
    except Exception as e:
        _log(f"extract_cards_from_live_dom error: {e}")
        return []


def fetch_serp_html_via_browser_requests(driver: Driver, url: str):
    """
    Fetch SERP HTML using Botasaurus browser fetch API:
      response = driver.requests.get(url)
    """
    try:
        return driver.requests.get(url)
    except Exception as e:
        return {"error": str(e)}


def response_to_status_and_html(resp) -> tuple[int | None, str]:
    """
    Normalize driver.requests.get(...) response to (status, html).
    """
    status = None
    html = ""
    try:
        status = getattr(resp, "status_code", None) or getattr(resp, "status", None)
    except Exception:
        status = None
    try:
        html = getattr(resp, "text", None) or getattr(resp, "body", None) or ""
    except Exception:
        html = ""
    if not isinstance(html, str):
        try:
            html = html.decode("utf-8", errors="ignore")
        except Exception:
            html = str(html)
    return status, html


def extract_pagination_urls(driver: Driver) -> list[str]:
    """
    Extract pagination URLs from Google search results.
    Looks for table > tbody > tr > td > a pattern at bottom of page.
    """
    urls: list[str] = []
    
    try:
        # Find the pagination table
        table = driver.select("table")
        if not table:
            return urls
        
        # Find tbody
        tbody = table.select("tbody")
        if not tbody:
            return urls
        
        # Find all rows
        rows = tbody.select_all("tr")
        
        for row in rows:
            cells = row.select_all("td")
            
            # Limit to MAX_PAGINATION_PAGES
            max_cells = min(len(cells), MAX_PAGINATION_PAGES)
            
            for i in range(max_cells):
                cell = cells[i]
                anchor = cell.select("a")
                
                if anchor:
                    href = anchor.get_attribute("href")
                    if href:
                        # Build full URL
                        full_url = GOOGLE_BASE_URL + href if href.startswith("/") else href
                        urls.append(full_url)
    except Exception as e:
        print(f"Error extracting pagination: {e}")
    
    return urls


def dedupe_results(results: list) -> list:
    """
    Remove duplicates while preserving order.
    Also normalizes URLs by removing fragments.
    """
    seen = set()
    unique_results = []
    
    for item in results or []:
        url = None
        if isinstance(item, dict):
            url = item.get("url")
        elif isinstance(item, str):
            url = item
        if not url:
            continue
        clean_url = url.split("#")[0]
        if clean_url in seen:
            continue
        seen.add(clean_url)
        if isinstance(item, dict):
            cloned = dict(item)
            cloned["url"] = clean_url
            unique_results.append(cloned)
        else:
            unique_results.append(clean_url)
    
    return unique_results


def scrape_url_with_retry(driver: Driver, url: str, max_retries: int) -> list:
    """
    Scrape a single URL with retry logic.
    
    Args:
        driver: Botasaurus Driver
        url: URL to scrape
        max_retries: Maximum number of retry attempts
    
    Returns:
        List of extracted links
    """
    for attempt in range(max_retries):
        try:
            driver.get(url)
            driver.sleep(1.5)
            blocked = google_unusual_traffic_message(driver)
            if blocked:
                raise GoogleSearchBlockedError(blocked)
            cards = extract_cards_from_live_dom(driver)
            return cards
        except GoogleSearchBlockedError:
            raise
        except Exception as e:
            print(f"Attempt {attempt + 1}/{max_retries} failed for {url}: {e}")
            if attempt < max_retries - 1:
                time.sleep(1)

    return []


def scrape_pagination_sequential(driver: Driver, urls: list, max_retries: int) -> list:
    """
    Scrape multiple pagination URLs sequentially in the same browser.
    
    Args:
        driver: Botasaurus Driver
        urls: List of pagination URLs to scrape
        max_retries: Maximum retries per URL
    
    Returns:
        Combined list of all extracted links
    """
    all_results = []
    
    for idx, url in enumerate(urls):
        print(f"Scraping pagination {idx + 1}/{len(urls)}: {url}")
        links = scrape_url_with_retry(driver, url, max_retries)
        all_results.extend(links)
        print(f"  Found {len(links)} links")
    
    return all_results


# _scrape_google_links_impl — pull new fields from query_params
def _scrape_google_links_impl(driver: Driver, query_params: dict):
    query        = (query_params.get("query") or "").strip()
    country_code = (query_params.get("country_code") or "us").strip()
    near         = query_params.get("near")         # city / locality for &near=
    time_filter  = query_params.get("time_filter")  # Optional[str]
    max_results  = query_params.get("max_results")
    # Retries for navigation/pagination fetches (configurable via env MAX_RETRIES)
    try:
        max_retries = int(query_params.get("max_retries") or settings.MAX_RETRIES)
    except Exception:
        max_retries = int(settings.MAX_RETRIES or 3)

    search_target = normalize_google_search_target(
        query,
        country_code=country_code,
        near=near,
        time_filter=time_filter,
    )

    _log(f"final search URL: {search_target!r}")

    if not search_target:
        return {"success": False, "data": [], "error": ["No query provided"]}

    all_results = []

    try:
        # Step 1: Navigate to the search URL (with retry)
        _log(f"query/input: {query!r}")
        _log(f"near:         {near!r}")
        _log(f"navigation URL: {search_target!r}")
        for attempt in range(max_retries):
            try:
                driver.get_via(search_target, referer=GOOGLE_BASE_URL)

                _log(f"current URL after nav: {driver.current_url!r}")

                # Log what location Google resolved to
                try:
                    location_text = driver.get_text("#Rzn5id") or driver.get_text(".T3GKJD") or ""
                    _log(f"Google location widget: {location_text!r}")
                except Exception:
                    pass

                _log(f"page title: {driver.title!r}")

                driver.sleep(2)
                try:
                    cur = driver.current_url or ""
                    if cur.startswith("chrome://") or cur.startswith("about:"):
                        _log(
                            "still on internal browser page after google_get; "
                            "retrying with driver.get(search URL)"
                        )
                        driver.get(search_target)
                        driver.sleep(2)
                except Exception as inner:
                    _log(f"post-google_get fallback navigation check failed: {inner}")
                break
            except Exception as e:
                _log(f"Initial page attempt {attempt + 1}/{max_retries} failed: {e}")
                if attempt == max_retries - 1:
                    return {"success": False, "data": [], "error": ["Failed to load Google search page after retries"]}
                time.sleep(1)

        block_msg = google_unusual_traffic_message(driver)
        if block_msg:
            _log(f"google block (first page): {block_msg!r}")
            log_serp_diagnostics(
                "unusual_traffic_block",
                collect_serp_diagnostics(driver, sample_hrefs=[]),
            )
            return {"success": False, "data": [], "error": [block_msg]}

        # Step 2: Extract cards from first page (live DOM)
        raw_samples = []
        try:
            for a in (driver.select_all("div#search a") or [])[:15]:
                raw_samples.append(a.get_attribute("href"))
        except Exception as e:
            _log(f"could not sample raw hrefs: {e}")
        log_serp_diagnostics("after first load", collect_serp_diagnostics(driver, sample_hrefs=raw_samples))

        first_page_cards = extract_cards_from_live_dom(driver)
        all_results.extend(first_page_cards)
        _log(f"First page: found {len(first_page_cards)} results")

        if not first_page_cards:
            log_serp_diagnostics(
                "no links on first page",
                collect_serp_diagnostics(driver, sample_hrefs=raw_samples),
            )

        # Step 3: Subsequent pages via browser fetch using Google's own pagination URLs
        per_page = 10
        desired = int(max_results or per_page)
        total_pages = max(1, min(MAX_PAGINATION_PAGES, int(math.ceil(desired / per_page))))

        pagination_urls = extract_pagination_urls(driver)
        if pagination_urls:
            pagination_urls = pagination_urls[: max(0, total_pages - 1)]
            _log(f"fetch-pagination: urls={len(pagination_urls)} (pages=2..{len(pagination_urls) + 1}, per_page={per_page}, max_results={desired})")

        for page_index, url in enumerate(pagination_urls, start=2):
            pre_delay = [0, 5, 15, 30][min(page_index - 2, 3)]
            if pre_delay:
                time.sleep(pre_delay)

            resp = None
            status = None
            html = ""
            for attempt in range(max_retries):
                resp = fetch_serp_html_via_browser_requests(driver, url)
                if isinstance(resp, dict) and resp.get("error"):
                    _log(f"fetch page {page_index} error attempt {attempt + 1}/{max_retries}: {resp.get('error')}")
                    if attempt < max_retries - 1:
                        time.sleep([2, 5, 10][min(attempt, 2)])
                        continue
                    break

                status, html = response_to_status_and_html(resp)
                low = (html or "").lower()
                if status == 429 or "recaptcha" in low or "detected unusual traffic" in low or "/sorry/" in low:
                    _log(f"fetch page {page_index} blocked (status={status}) attempt {attempt + 1}/{max_retries}")
                    if attempt < max_retries - 1:
                        time.sleep([2, 5, 10][min(attempt, 2)])
                        continue
                break

            soup = BeautifulSoup(html or "", "html.parser") if html else None
            cards = extract_cards_from_soup(soup) if soup else []
            _log(f"page {page_index} (fetch): {len(cards)} results")
            all_results.extend(cards)
        
        # Step 5: Remove duplicates
        unique_results = dedupe_results(all_results)
        print(f"Total unique links: {len(unique_results)}")
        
        # Apply max_results limit if specified
        if max_results and max_results > 0:
            unique_results = unique_results[:max_results]
        
        return {"success": True, "data": unique_results, "error": []}

    except GoogleSearchBlockedError as e:
        _log(f"google block: {e.message}")
        return {"success": False, "data": [], "error": [e.message]}
    except Exception as e:
        print(f"Scraping error: {e}")
        return {"success": False, "data": [], "error": [str(e)]}


def scrape_google_links(query_params: dict) -> dict:
    """
    Run Google link scraping with proxy and Chrome flags from ``_gsearch_browser_kwargs``.

    Called from the HTTP handler; builds ``browser(...)`` at runtime so proxy/env
    stay in sync without import-time configuration.
    """
    country_code = query_params.get("country_code")
    kwargs = _gsearch_browser_kwargs(country_code=country_code)
    task = browser(**kwargs)(_scrape_google_links_impl)
    try:
        return task(query_params)
    finally:
        closer = getattr(task, "close", None)
        if callable(closer):
            try:
                closer()
            except Exception as ex:
                _log(f"browser close warning: {ex}")
