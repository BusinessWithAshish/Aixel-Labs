---
name: botasaurus
description: Build web scrapers using the Botasaurus framework with @browser, @request, and @task decorators. Covers anti-detection browsing, humane HTTP requests, parallel scraping, caching, proxy configuration, Cloudflare bypass, UI scrapers, desktop extractors, and deployment. Use when building scrapers, automating browsers, bypassing bot detection, or working with Botasaurus Driver, AntiDetectRequests, sitemaps, or scraping utilities.
---

# Botasaurus Web Scraping Framework

Botasaurus is an all-in-one Python web scraping framework with anti-detection capabilities, built-in parallelization, caching, and UI/desktop app support.

## Installation

```bash
python -m pip install --upgrade botasaurus
```

## Core Concepts

Botasaurus provides 3 decorators:

- **`@browser`**: Scrape using a humane anti-detection browser (Botasaurus Driver)
- **`@request`**: Scrape using lightweight humane HTTP requests (AntiDetectRequests)
- **`@task`**: Run non-browser tasks, use third-party libs (playwright/selenium), or data processing

## Quick Start — @browser

```python
from botasaurus.browser import browser, Driver

@browser
def scrape_heading_task(driver: Driver, data):
    driver.get("https://www.omkar.cloud/")
    heading = driver.get_text("h1")
    return {"heading": heading}

scrape_heading_task()
```

Results auto-save to `output/scrape_heading_task.json`.

## Quick Start — @request

```python
from botasaurus.request import request, Request
from botasaurus.soupify import soupify

@request
def scrape_heading_task(request: Request, data):
    response = request.get("https://www.omkar.cloud/")
    soup = soupify(response)
    heading = soup.find('h1').get_text()
    return {"heading": heading}

scrape_heading_task()
```

## Passing Data

Pass a single item or list. Lists are processed sequentially (one browser/request per item):

```python
scrape_heading_task(["https://www.omkar.cloud/", "https://stackoverflow.com/"])
```

Dictionaries also work:

```python
@browser(data=[{"name": "Dhoni"}, {"name": "Sehwag"}])
def scrape(driver: Driver, data: dict):
    ...
```

## Standalone Driver/Request Usage

```python
from botasaurus import bt

driver = bt.create_driver()
# ... scraping code ...
driver.quit()

anti_detect_request = bt.create_request()
soup = anti_detect_request.bs4("https://www.omkar.cloud/")
```

## Key Decorator Options (All 3 Decorators)

| Option | Description |
|--------|-------------|
| `parallel=N` | Run N instances in parallel |
| `cache=True` | Cache results, skip re-scraping |
| `metadata={...}` | Pass shared data (API keys, cookies) excluded from cache key |
| `max_retry=N` | Retry failed tasks N times |
| `close_on_crash=False` | Pause browser on error for debugging (default) |
| `output="name"` | Custom output filename |
| `output=None` | Disable output |
| `raise_exception=True` | Halt on error |
| `create_error_logs=False` | Disable error logs in production |

## Debugging

- Results saved to `output/{function_name}.json` — no print statements needed
- On crash in browser mode: beep sound + browser pauses for inspection
- In headless mode: errors still open the page in default browser
- Use `driver.prompt()` to pause and inspect during development

## Reference Documentation

For detailed documentation on each topic, read the corresponding reference file:

- **[Browser Decorator](references/browser-decorator.md)** — @browser configuration: images, proxies, profiles, headless, extensions, captcha, language, user agent, reuse_driver, wait options
- **[Request Decorator](references/request-decorator.md)** — @request configuration and humane HTTP requests
- **[Driver API](references/driver-api.md)** — Complete Botasaurus Driver method reference: navigation, selectors, clicking, typing, JS execution, iframes, shadow DOM, drag-and-drop, human mode, request monitoring
- **[Common Decorator Options](references/decorator-common-options.md)** — parallel, cache, metadata, async_queue, run_async, output, error handling details
- **[Anti-Detection & Proxies](references/anti-detection-proxies.md)** — Cloudflare bypass, proxy setup, SSL proxies, detection avoidance, IP management
- **[UI Scraper](references/ui-scraper.md)** — Building UI-based scrapers with filters, sorts, views, input controls, server configuration, PostgreSQL
- **[Utilities](references/utilities.md)** — bt utility, Sitemap, Links, LocalStorage, soupify, IPUtils, Cache, Profiles
- **[Deployment](references/deployment.md)** — Docker, Gitpod, VM setup, Google Cloud, Kubernetes, data download
- **[Desktop Extractor](references/desktop-extractor.md)** — Building cross-platform desktop apps with Botasaurus Desktop
- **[Best Practices](references/best-practices.md)** — Production settings, caching strategy, proxy cost reduction, detection avoidance
- **[Examples](references/examples.md)** — Complete practical examples combining multiple features
