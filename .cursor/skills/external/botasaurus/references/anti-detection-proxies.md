# Anti-Detection & Proxy Configuration

## Cloudflare Bypass

Cloudflare is the most popular protection system. Botasaurus handles different challenge types:

### Connection Challenge (Most Common)

Used on product pages, blog pages, search result pages. Requires browser-like connection with appropriate headers.

**Method 1: Google Referrer (browser)**

```python
from botasaurus.browser import browser, Driver

@browser
def scrape(driver: Driver, data):
    driver.google_get("https://www.cloudflare.com/en-in/")
    heading = driver.get_text('h1')
    return heading

scrape()
```

**Method 2: Request module (auto Google Referrer)**

```python
from botasaurus.request import request, Request

@request(max_retry=10)
def scrape(request: Request, data):
    response = request.get("https://www.cloudflare.com/en-in/")
    response.raise_for_status()
    return response.text

scrape()
```

### JS with Captcha Challenge

Used on rarely visited pages (5th review page, auth pages). Requires JS computation + captcha solving.

`@request` does NOT work (can't run JavaScript).

Use `bypass_cloudflare=True`:

```python
from botasaurus.browser import browser, Driver

@browser
def scrape(driver: Driver, data):
    driver.google_get("https://nopecha.com/demo/cloudflare", bypass_cloudflare=True)
    driver.prompt()

scrape()
```

## Bot Detection Systems Botasaurus Can Bypass

- Cloudflare Web Application Firewall (WAF)
- BrowserScan Bot Detection
- Fingerprint Bot Detection
- Datadome Bot Detection
- Cloudflare Turnstile CAPTCHA

## Why Botasaurus SSL Proxies Are Superior

Standard Selenium proxy libraries (e.g., seleniumwire) use non-SSL connections, which are GUARANTEED to be detected by Cloudflare/Datadome. Botasaurus uses SSL-based proxy authentication, making it undetectable.

## Proxy Configuration

### Recommended Providers

**Rotating Datacenter Proxies:**
- **requests-ip-rotator** (recommended default): Routes through AWS API Gateway. Negligible cost even for millions of pages.
- **BrightData Datacenter Proxies**: ~$0.6/GB pay-as-you-go. Smaller pool than AWS.

**Rotating Residential Proxies:**
- **IPRoyal Royal Residential**: ~$7/GB pay-as-you-go. No KYC required.

### Best Country for Proxies

Use **United States** — fastest infrastructure, most websites hosted there.

### When to Use Proxies

**ONLY when you encounter IP blocks.** Most scrapers unnecessarily use proxies.

Best practice:
1. First scrape using `@browser` on home Wi-Fi
2. Only resort to proxies when blocked
3. This saves time (proxies are slow) and money (proxies are expensive)

### Socket Connection Errors

If you get socket errors, the proxy provider may be blocking that website. Test with:

```python
@browser(proxy="http://username:password@proxy-domain:port")
def test(driver: Driver, data):
    driver.get("https://whatismyipaddress.com/")
    driver.prompt()

test()
```

If whatismyipaddress.com works but target doesn't → switch proxy provider.

## Detection Avoidance Best Practices

If getting detected:

1. **Upgrade all packages**:
   ```bash
   python -m pip install --upgrade bota botasaurus botasaurus-api botasaurus-requests botasaurus-driver botasaurus-proxy-authentication botasaurus-server botasaurus-humancursor
   ```

2. **Enable Human Mode** for mouse movements:
   ```python
   driver.enable_human_mode()
   ```

3. **Avoid rapid `driver.get` calls**. Instead:
   - Click within pages with Human Mode enabled
   - Use `driver.google_get` or `driver.get_via_this_page`
   - Use `driver.requests.get` for page HTML

4. **Add random delays**:
   ```python
   driver.short_random_sleep()
   driver.long_random_sleep()
   ```

5. **Avoid headless mode** (detectable by Cloudflare, Datadome, Imperva)

6. **Use residential proxies** (datacenter IPs are flagged)

7. **Remove detectable arguments** for Datadome:
   ```python
   @browser(remove_default_browser_check_argument=True)
   ```

8. **Change flagged IP** via mobile hotspot:
   - Connect PC to phone hotspot
   - Toggle airplane mode on phone
   - Reconnect hotspot → new IP

## Closing Stale Chrome Instances

```bash
python -m close_chrome
```

## Reducing Proxy Costs (Save 97%)

Instead of loading full pages, use browser fetch API for subsequent requests:

```python
from botasaurus.browser import browser, Driver
from botasaurus.soupify import soupify

@browser(reuse_driver=True, max_retry=5)
def scrape(driver: Driver, link):
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
scrape(links)
```

This approach: first visit normally (full page), then use browser's `fetch` for HTML-only requests. Compressed by browser → 250GB reduced to 5GB.

### Rate Limiting

```python
driver.sleep(1.13)  # Most Nginx servers: 1 req/sec rate limit
response = driver.requests.get(link)
```

### Large Cookie Errors

```python
response = driver.requests.get(link)
if response.status_code == 400:
    driver.delete_cookies()
    driver.short_random_sleep()
    response = driver.requests.get(link)
```

### Parallel Fetch

```python
driver.requests.get_mank(links)  # Multiple parallel requests
```
