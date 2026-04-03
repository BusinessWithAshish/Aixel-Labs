# Best Practices

## Caching Strategy

The most important best practice: separate HTML scraping from data extraction.

### Bad Pattern (Don't Do This)

```python
@request
def scrape_data(request: Request, data):
    response = request.get(data)
    soup = soupify(response)
    heading = soup.find('h1').get_text()
    return {"heading": heading}
```

Problem: If selectors break or customer wants new fields after 50% scraped, you must re-scrape everything.

### Good Pattern (Do This)

```python
from bs4 import BeautifulSoup
from botasaurus.task import task
from botasaurus.request import request, Request
from botasaurus.soupify import soupify

@request(cache=True)
def scrape_html(request: Request, link):
    html = request.get(link).text
    return html

def extract_data(soup: BeautifulSoup):
    heading = soup.find("h1").get_text()
    return {"heading": heading}

@task(cache=True)
def scrape_data(link):
    html = scrape_html(link)
    return extract_data(soupify(html))

scrape_data(data_items)
```

Benefits:
- If selectors break: delete `cache/scrape_data` folder, re-run. Only re-runs extraction, not HTTP requests.
- Easy to test: `bt.write_temp_json(scrape_data("link", cache=False))`

## Production-Ready Template: @request

For websites with minimal protection:

```python
from bs4 import BeautifulSoup
from botasaurus.task import task
from botasaurus.request import request, Request, NotFoundException
from botasaurus.soupify import soupify

@request(
    # proxy='http://user:pass@proxy:port',  # Uncomment ONLY if IP blocked
    cache=True,
    max_retry=20,
    output=None,
    close_on_crash=True,
    raise_exception=True,
    create_error_logs=False,
)
def scrape_html(request: Request, link):
    response = request.get(link)
    if response.status_code == 404:
        raise NotFoundException(link)
    response.raise_for_status()
    return response.text

def extract_data(soup: BeautifulSoup):
    heading = soup.find("h1").get_text()
    return {"heading": heading}

@task(
    cache=True,
    close_on_crash=True,
    create_error_logs=False,
    parallel=40,
)
def scrape_data(link):
    html = scrape_html(link)
    return extract_data(soupify(html))

scrape_data(data_items)
```

## Production-Ready Template: @browser

For well-protected websites:

```python
from bs4 import BeautifulSoup
from botasaurus.task import task
from botasaurus.browser import browser, Driver, NotFoundException
from botasaurus.soupify import soupify

@browser(
    # proxy='http://user:pass@proxy:port',  # Uncomment ONLY if IP blocked
    # block_images_and_css=True,  # Uncomment to speed up
    # wait_for_complete_page_load=False,  # Uncomment for SSR pages
    cache=True,
    max_retry=5,
    reuse_driver=True,
    output=None,
    close_on_crash=True,
    raise_exception=True,
    create_error_logs=False,
)
def scrape_html(driver: Driver, link):
    if driver.config.is_new:
        driver.google_get(
            link,
            bypass_cloudflare=True,  # Remove if not Cloudflare-protected
        )
    response = driver.requests.get(link)
    if response.status_code == 404:
        raise NotFoundException(link)
    response.raise_for_status()
    return response.text

def extract_data(soup: BeautifulSoup):
    stock_name = soup.select_one('[data-testid="quote-hdr"] h1').get_text()
    stock_price = soup.select_one('[data-testid="qsp-price"]').get_text()
    return {"stock_name": stock_name, "stock_price": stock_price}

@task(
    cache=True,
    close_on_crash=True,
    create_error_logs=False,
)
def scrape_data(link):
    html = scrape_html(link)
    return extract_data(soupify(html))

scrape_data(data_items)
```

## Proxy Usage Guidelines

1. **Try without proxies first** — scrape with `@browser` on home Wi-Fi
2. **Only add proxies when blocked**
3. **Prefer @request over @browser** to save bandwidth
4. **Use browser fetch API** (`driver.requests.get`) to reduce bandwidth 97%
5. **Block images** (`block_images=True`) to reduce bandwidth
6. **Choose US proxies** for fastest speeds

## When to Use Which Decorator

| Scenario | Decorator |
|----------|-----------|
| Unprotected websites | `@request` |
| Well-protected websites (Cloudflare, Datadome) | `@browser` |
| Non-web tasks (data processing, file conversion) | `@task` |
| Third-party libs (playwright, selenium) | `@task` |

## Output Format Recommendations

- Deliver datasets in **JSON and Excel** formats
- Avoid CSV unless requested (Excel renders nested JSON in CSV poorly)
- Use `bt.Formats.JSON` and `bt.Formats.EXCEL`

## Memory Tips for Large Datasets

- Use `ndjson` format for memory efficiency
- Ensure VM has enough memory
- Use `output_formats` to control output size
