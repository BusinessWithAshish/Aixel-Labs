# @request Decorator Configuration

The `@request` decorator makes humane HTTP requests using `botasaurus-requests` (based on `hrequests`).

Features:
- Browser-like headers in correct order
- Browser-like TLS connection with correct ciphers
- Uses `google.com` referer by default (appears as if user arrived from Google search)
- Cookie preservation

```python
from botasaurus.request import request, Request
from botasaurus.soupify import soupify
```

## Basic Usage

```python
@request
def scrape_heading(request: Request, data):
    response = request.get("https://www.omkar.cloud/")
    soup = soupify(response)
    heading = soup.find('h1').get_text()
    return {"heading": heading}

scrape_heading()
```

## With Proxy

```python
@request(proxy="http://username:password@proxy-domain:port")
def scrape(request: Request, data):
    ...
```

## Supported Options

`@request` supports the same common options as `@browser`:

- `parallel` — parallel processing
- `cache` — result caching
- `max_retry` — retry on failure
- `user_agent` — custom user agent
- `proxy` — proxy configuration (single or list for rotation)
- `run_async` — asynchronous execution
- `async_queue` — asynchronous queue processing
- `output` / `output_formats` — output configuration
- `raise_exception` / `must_raise_exceptions` — exception handling
- `close_on_crash` — crash behavior
- `create_error_logs` — error log creation
- `metadata` — shared metadata

## Example with Multiple Options

```python
@request(
    parallel=40,
    cache=True,
    proxy="http://username:password@proxy-domain:port",
    data=["https://www.omkar.cloud/", "https://stackoverflow.com/"]
)
def scrape_heading(request: Request, link):
    soup = request.bs4(link)
    heading = soup.find('h1').get_text()
    return {"heading": heading}
```

## NotFoundException

Skip retrying for 404 pages:

```python
from botasaurus.request import request, Request, NotFoundException

@request(max_retry=20, cache=True)
def scrape_html(request: Request, link):
    response = request.get(link)
    if response.status_code == 404:
        raise NotFoundException(link)
    response.raise_for_status()
    return response.text
```
