# Common Decorator Options

All three decorators (`@browser`, `@request`, `@task`) support these shared options.

## Parallel Execution

Launch multiple instances simultaneously:

```python
@browser(parallel=3, data=[
    "https://stackoverflow.blog/open-source",
    "https://stackoverflow.blog/ai",
    "https://stackoverflow.blog/productivity",
])
def scrape_heading(driver: Driver, link):
    driver.get(link)
    return driver.get_text('h1')

scrape_heading()
```

Calculate optimal parallel count based on available RAM:

```python
from botasaurus import bt

@browser(parallel=bt.calc_max_parallel_browsers, data=[...])
def scrape(driver: Driver, data):
    ...
```

Example: 5.8 GB free RAM → returns 10 (can run up to 10 browsers in parallel).

## Caching

Cache results to avoid re-scraping:

```python
@browser(cache=True, data=[...])
def scrape_heading(driver: Driver, link):
    driver.get(link)
    return driver.get_text('h1')

print(scrape_heading())   # Scrapes data
print(scrape_heading())   # Returns cached data instantly
```

Cache is stored in `cache/{function_name}/` folder. Delete the folder to clear cache.

## Metadata

Pass common information shared across all data items (excluded from cache key):

```python
@task()
def scrape(data, metadata):
    print("metadata:", metadata)
    print("data:", data)

data = [
    {"profile": "pikachu", "proxy": "http://142.250.77.228:8000"},
    {"profile": "greyninja", "proxy": "http://142.250.77.229:8000"},
]
scrape(data, metadata={"api_key": "BDEC26..."})
```

## Async Queue

For real-time scrapers where speed is paramount. Run tasks asynchronously in a queue and collect results with `.get()`.

Use case: Scrolling a page while simultaneously scraping details in the background.

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

    results = scrape_place_obj.get()
    return results

scrape_google_maps("https://www.google.com/maps/search/web+developers+in+bangalore")
```

`async_queue` only invokes the scraping function for unique links, avoiding redundant operations.

## Run Async

Execute scraping tasks asynchronously:

```python
from botasaurus.browser import browser, Driver
from time import sleep

@browser(run_async=True)
def scrape_heading(driver: Driver, data):
    sleep(5)
    return {}

if __name__ == "__main__":
    result1 = scrape_heading()   # Launches asynchronously
    result2 = scrape_heading()   # Launches asynchronously

    result1.get()   # Wait for first result
    result2.get()   # Wait for second result
```

## Close on Crash

```python
@browser(close_on_crash=False)   # Default: pause browser on error (for development)
@browser(close_on_crash=True)    # Close browser and continue (for production)
```

## Output Configuration

### Custom filename

```python
@task(output="my-output")
def scrape(data):
    return {"heading": "Hello, Mom!"}
```

### Disable output

```python
@task(output=None)
def scrape(data):
    ...
```

### Dynamic output with function

```python
from botasaurus import bt

def write_output(data, result):
    json_filename = bt.write_json(result, 'data')
    excel_filename = bt.write_excel(result, 'data')
    bt.zip_files([json_filename, excel_filename])

@task(output=write_output)
def scrape(data):
    return {"heading": "Hello, Mom!"}
```

### Upload to S3

```python
def write_output(data, result):
    json_filename = bt.write_json(result, 'data')
    bt.upload_to_s3(json_filename, 'my-bucket', "AWS_ACCESS_KEY", "AWS_SECRET_KEY")

@task(output=write_output)
def scrape(data):
    ...
```

### Multiple output formats

```python
from botasaurus import bt

@task(output_formats=[bt.Formats.JSON, bt.Formats.EXCEL])
def scrape(data):
    return {"heading": "Hello, Mom!"}
```

**PRO TIP**: Deliver data in JSON and Excel formats. Avoid CSV unless requested — Microsoft Excel renders CSV with nested JSON poorly.

### Dynamic filename from function

Return a tuple of `(filename, data)`:

```python
@browser(block_images=True, cache=True)
def scrape_links(driver: Driver, data):
    driver.get("https://www.omkar.cloud/blog/")
    links = driver.links("h3 a")
    filename = "links"
    return filename, links
```

## Exception Handling

```python
@browser(
    max_retry=5,                                # Retry up to 5 times
    retry_wait=10,                              # Wait 10 seconds between retries
    raise_exception=True,                       # Halt on error
    must_raise_exceptions=[CustomException],    # Always raise these, even if raise_exception=False
    create_error_logs=False,                    # Disable error logs (recommended for production)
)
def scrape(driver: Driver, data):
    ...
```

Default behavior: Botasaurus does NOT raise exceptions — if scraping 10,000 links overnight and one fails, the rest still complete.
