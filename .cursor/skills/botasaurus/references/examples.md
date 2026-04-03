# Complete Practical Examples

## Example 1: Scrape Blog Articles (Multi-Step)

Scrape article links from a blog, then visit each to get heading and date:

```python
from botasaurus.browser import browser, Driver
from botasaurus import bt

@browser(
    block_images=True,
    cache=True,
    parallel=bt.calc_max_parallel_browsers,
    reuse_driver=True
)
def scrape_articles(driver: Driver, link):
    driver.get(link)
    heading = driver.get_text("h1")
    date = driver.get_text("time")
    return {"heading": heading, "date": date, "link": link}

@browser(block_images=True, cache=True)
def scrape_article_links(driver: Driver, data):
    driver.get("https://www.omkar.cloud/blog/")
    links = driver.links("h3 a")
    filename = "links"
    return filename, links

if __name__ == "__main__":
    links = scrape_article_links()
    scrape_articles(links)
```

## Example 2: Google Maps Scraper (Async Queue)

Scroll Google Maps list while simultaneously scraping place details:

```python
from botasaurus.browser import browser, Driver, AsyncQueueResult
from botasaurus.request import request, Request
import json

def extract_title(html):
    return json.loads(
        html.split(";window.APP_INITIALIZATION_STATE=")[1].split(";window.APP_FLAGS")[0]
    )[5][3][2][1]

@request(parallel=5, async_queue=True, max_retry=5)
def scrape_place_title(request: Request, link, metadata):
    cookies = metadata["cookies"]
    html = request.get(link, cookies=cookies, timeout=12).text
    title = extract_title(html)
    print("Title:", title)
    return title

def has_reached_end(driver):
    return driver.select('p.fontBodyMedium > span > span') is not None

def extract_links(driver):
    return driver.get_all_links('[role="feed"] > div > div > a')

@browser()
def scrape_google_maps(driver: Driver, link):
    driver.google_get(link, accept_google_cookies=True)
    scrape_place_obj: AsyncQueueResult = scrape_place_title()
    cookies = driver.get_cookies_dict()

    while True:
        links = extract_links(driver)
        scrape_place_obj.put(links, metadata={"cookies": cookies})
        print("scrolling")
        driver.scroll_to_bottom('[role="feed"]')
        if has_reached_end(driver):
            break

    return scrape_place_obj.get()

scrape_google_maps("https://www.google.com/maps/search/web+developers+in+bangalore")
```

## Example 3: Stock Scraper (Browser Fetch for Reduced Proxy Costs)

First visit opens browser normally, subsequent requests use browser's fetch API:

```python
from botasaurus.browser import browser, Driver
from botasaurus.soupify import soupify

@browser(reuse_driver=True, max_retry=5)
def scrape_data(driver: Driver, link):
    if driver.config.is_new:
        driver.google_get(link)

    response = driver.requests.get(link)
    response.raise_for_status()
    html = response.text

    soup = soupify(html)
    stock_name = soup.select_one('[data-testid="quote-hdr"] h1').get_text()
    stock_price = soup.select_one('[data-testid="qsp-price"]').get_text()

    return {"stock_name": stock_name, "stock_price": stock_price}

links = [
    "https://finance.yahoo.com/quote/AAPL/",
    "https://finance.yahoo.com/quote/GOOG/",
    "https://finance.yahoo.com/quote/MSFT/",
]
scrape_data(links)
```

## Example 4: Sitemap → Dataset Pipeline

Extract product links from sitemap, then scrape each:

```python
from botasaurus import bt
from botasaurus.sitemap import Sitemap, Filters, Extractors
from botasaurus.task import task
from botasaurus.request import request, Request, NotFoundException
from botasaurus.soupify import soupify

# Step 1: Get links from sitemap
links = (
    Sitemap("https://www.g2.com/sitemaps/sitemap_index.xml.gz")
    .filter(Filters.first_segment_equals("products"))
    .extract(Extractors.extract_link_upto_second_segment())
    .write_links('g2-products')
)

# Step 2: Scrape HTML (cached)
@request(cache=True, max_retry=20, output=None, close_on_crash=True, raise_exception=True, create_error_logs=False)
def scrape_html(request: Request, link):
    response = request.get(link)
    if response.status_code == 404:
        raise NotFoundException(link)
    response.raise_for_status()
    return response.text

# Step 3: Extract data
def extract_data(soup):
    name = soup.find("h1").get_text()
    return {"name": name}

@task(cache=True, close_on_crash=True, create_error_logs=False, parallel=40)
def scrape_data(link):
    html = scrape_html(link)
    return extract_data(soupify(html))

scrape_data(links)
```

## Example 5: Cloudflare-Protected Site with Human Mode

```python
from botasaurus.browser import browser, Driver

@browser
def scrape_protected(driver: Driver, data):
    driver.get("https://nopecha.com/demo/cloudflare")
    driver.long_random_sleep()

    iframe = driver.get_element_at_point(160, 290)
    checkbox = iframe.get_element_at_point(30, 30)

    driver.enable_human_mode()
    checkbox.click()
    driver.disable_human_mode()

    driver.prompt()

scrape_protected()
```

## Example 6: Profile Management with Tiny Profiles

```python
from botasaurus.browser import browser, Driver
from botasaurus.user_agent import UserAgent
from botasaurus.window_size import WindowSize

def get_profile(data):
    return data["profile"]

def get_proxy(data):
    return data["proxy"]

@browser(
    tiny_profile=True,
    profile=get_profile,
    proxy=get_proxy,
    user_agent=UserAgent.HASHED,
    window_size=WindowSize.HASHED,
    reuse_driver=True,
)
def scrape_with_profiles(driver: Driver, data):
    driver.get(data["url"])
    return driver.get_text("h1")

data = [
    {"profile": "user1", "proxy": "http://user:pass@proxy1:port", "url": "https://example.com"},
    {"profile": "user2", "proxy": "http://user:pass@proxy2:port", "url": "https://example.com"},
]

scrape_with_profiles(data)
```

## Example 7: UI Scraper with Filters, Sorts, and Views

`backend/scrapers.py`:

```python
from botasaurus_server.server import Server
from botasaurus_server.ui import filters, sorts, View, Field, ExpandDictField, ExpandListField
from src.scrape_product_data import scrape_product_data

def calculate_average_rating(value, record):
    total_reviews = sum(value.values())
    if total_reviews == 0:
        return 0
    return sum(int(r) * c for r, c in value.items()) / total_reviews

all_filters = [
    filters.SearchTextInput("name"),
    filters.MinNumberInput("reviews", label="Minimum Reviews"),
    filters.SingleSelectDropdown("category", options=[
        {"value": "apparel", "label": "Apparel"},
        {"value": "electronics", "label": "Electronics"}
    ]),
    filters.IsTrueCheckbox("is_available", label="Is Available"),
]

all_sorts = [
    sorts.AlphabeticAscendingSort("name"),
    sorts.Sort(label="Top Products", is_default=True, sorts=[
        sorts.NumericDescendingSort("reviews"),
        sorts.TrueFirstSort("is_available")
    ])
]

overview_view = View("Overview", fields=[
    Field("id"),
    Field("name"),
    Field("price"),
    Field("reviews"),
    Field("reviews_per_rating", output_key="average_rating", map=calculate_average_rating),
    ExpandDictField("reviews_per_rating", fields=[
        Field("1", output_key="rating_1"),
        Field("2", output_key="rating_2"),
        Field("3", output_key="rating_3"),
        Field("4", output_key="rating_4"),
        Field("5", output_key="rating_5"),
    ]),
])

reviews_view = View("Featured Reviews", fields=[
    Field("id", output_key="product_id"),
    Field("name", output_key="product_name"),
    ExpandListField("featured_reviews", fields=[
        Field("rating"),
        Field("content"),
    ]),
])

Server.configure(
    title="Product Scraper",
    header_title="Product Data Scraper",
    description="Scrapes product data with reviews",
)

Server.set_rate_limit(browsers=1, requests=30)

Server.add_scraper(
    scrape_product_data,
    filters=all_filters,
    sorts=all_sorts,
    views=[overview_view, reviews_view],
)
```

## Example 8: Request Monitoring

```python
from botasaurus.browser import browser, Driver, cdp

@browser()
def scrape_responses(driver: Driver, data):
    def after_response_handler(request_id, response, event):
        url = response.url
        status = response.status
        headers = response.headers
        print("Response:", {"url": url, "status": status})
        driver.responses.append(request_id)

    driver.after_response_received(after_response_handler)
    driver.get("https://example.com/")
    return driver.responses.collect()

scrape_responses()
```

## Example 9: Shadow DOM Interaction

```python
from botasaurus.browser import browser, Driver

@browser
def scrape_shadow(driver: Driver, data):
    driver.get("https://nopecha.com/demo/cloudflare")
    driver.long_random_sleep()

    shadow_root_element = driver.select('[name="cf-turnstile-response"]').parent
    iframe = shadow_root_element.get_shadow_root()
    content = iframe.get_shadow_root()
    print(content.select("label", wait=8).text)
    driver.prompt()

scrape_shadow()
```

## Example 10: YouTube Iframe Data Extraction

```python
from botasaurus.browser import browser, Driver

@browser
def scrape_youtube_embed(driver: Driver, data):
    driver.get("https://www.freecodecamp.org/news/using-entity-framework-core-with-mongodb/")
    iframe = driver.get_iframe_by_link("www.youtube.com/embed")
    subscribers = iframe.select(".ytp-title-expanded-subtitle").text
    print(subscribers)
    return {"subscribers": subscribers}

scrape_youtube_embed()
```
