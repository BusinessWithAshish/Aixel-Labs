# @browser Decorator Configuration

The `@browser` decorator launches a humane anti-detection browser (Botasaurus Driver) for each scraping task.

```python
from botasaurus.browser import browser, Driver
```

## Blocking Images and CSS

Blocking images speeds up scraping and reduces proxy bandwidth significantly.

```python
@browser(block_images=True)
def scrape(driver: Driver, data):
    ...

@browser(block_images_and_css=True)
def scrape(driver: Driver, data):
    ...
```

## Proxies

Single proxy:

```python
@browser(proxy="http://username:password@proxy-domain:port")
def scrape(driver: Driver, data):
    driver.get("https://whatismyipaddress.com/")
    driver.prompt()

scrape()
```

Proxy rotation (list):

```python
@browser(proxy=[
    "http://username:password@proxy-domain:port",
    "http://username2:password2@proxy-domain:port"
])
def scrape(driver: Driver, data):
    ...
```

## Chrome Profiles

Standard profile (can be large ~100MB each):

```python
@browser(profile="pikachu")
def scrape(driver: Driver, data):
    ...
```

Tiny profile (recommended for many profiles — ~1KB each, cross-platform, persists cookies):

```python
@browser(tiny_profile=True, profile="pikachu")
def scrape(driver: Driver, data):
    ...
```

## Headless Mode

```python
@browser(headless=True)
def scrape(driver: Driver, data):
    ...
```

**Warning**: Headless mode is detectable by Cloudflare, Datadome, etc. Only use for unprotected sites.

## Chrome Extensions

Use any Chrome extension with 1 line:

```python
from botasaurus.browser import browser, Driver
from chrome_extension_python import Extension

@browser(extensions=[
    Extension("https://chromewebstore.google.com/detail/mouse-coordinates/mfohnjojhopfcahiddmeljeholnciakl")
])
def scrape(driver: Driver, data):
    driver.get("https://example.com/")
    driver.prompt()

scrape()
```

For extensions requiring configuration (API keys, credentials), create custom extensions. See [chrome-extension-python](https://github.com/omkarcloud/chrome-extension-python).

## Captcha Solving

Install capsolver:

```bash
python -m pip install capsolver_extension_python
```

Usage:

```python
from botasaurus.browser import browser, Driver
from capsolver_extension_python import Capsolver

@browser(extensions=[Capsolver(api_key="CAP-MY_KEY")])
def solve_captcha(driver: Driver, data):
    driver.get("https://recaptcha-demo.appspot.com/recaptcha-v2-checkbox.php")
    driver.prompt()

solve_captcha()
```

## Language

```python
from botasaurus.lang import Lang

@browser(lang=Lang.Hindi)
def scrape(driver: Driver, data):
    ...
```

## User Agent and Window Size

By default, Botasaurus does NOT change fingerprints (changing them makes the browser detectable via CSS tests).

For fingerprinting when needed:

```python
from botasaurus.browser import browser, Driver
from botasaurus.user_agent import UserAgent
from botasaurus.window_size import WindowSize

@browser(user_agent=UserAgent.RANDOM, window_size=WindowSize.RANDOM)
def scrape(driver: Driver, data):
    ...
```

For consistent fingerprints with profiles (hash-based):

```python
@browser(
    profile="pikachu",
    user_agent=UserAgent.HASHED,
    window_size=WindowSize.HASHED,
)
def scrape(driver: Driver, data):
    ...
```

## Passing Arguments to Chrome

```python
@browser(add_arguments=['--headless=new'])
def scrape(driver: Driver, data):
    ...
```

Dynamic arguments from data:

```python
def get_arguments(data):
    return ['--headless=new']

@browser(add_arguments=get_arguments)
def scrape(driver: Driver, data):
    ...
```

## Wait for Complete Page Load

By default, waits for all resources. Set to `False` to proceed once DOM is ready:

```python
@browser(wait_for_complete_page_load=False)
def scrape(driver: Driver, data):
    ...
```

## Reuse Driver

Reuse the same browser instance across data items instead of creating a new one each time:

```python
@browser(reuse_driver=True)
def scrape(driver: Driver, link):
    driver.get(link)

scrape(["https://www.omkar.cloud/", "https://stackoverflow.com/"])
```

Explicitly close when done:

```python
scrape.close()
```

Botasaurus auto-closes Chrome on program exit/cancel.

## Remove Default Browser Check Argument

For Datadome-protected sites, remove the detectable `--no-default-browser-check` argument:

```python
@browser(remove_default_browser_check_argument=True)
def scrape(driver: Driver, data):
    ...
```

## Virtual Display for VMs

When running headful browser in a VM (no physical display):

```python
@browser(enable_xvfb_virtual_display=True)
def scrape(driver: Driver, data):
    ...
```

## Dynamic Configuration from Data

Pass functions to derive config from data items:

```python
def get_profile(data):
    return data["profile"]

def get_proxy(data):
    return data["proxy"]

@browser(profile=get_profile, proxy=get_proxy)
def scrape(driver: Driver, data):
    profile, proxy = driver.config.profile, driver.config.proxy
    print(profile, proxy)

data = [
    {"profile": "pikachu", "proxy": "http://142.250.77.228:8000"},
    {"profile": "greyninja", "proxy": "http://142.250.77.229:8000"},
]
scrape(data)
```

Or pass directly when calling:

```python
@browser
def scrape(driver: Driver, data):
    ...

scrape(profile='pikachu', proxy="http://142.250.77.228:8000")
```

## Keep Drivers Alive

Maintain active driver sessions across multiple calls:

```python
@browser(
    keep_drivers_alive=True,
    parallel=bt.calc_max_parallel_browsers,
    reuse_driver=True,
)
def scrape(driver: Driver, data):
    ...

for i in range(3):
    scrape()
scrape.close()
```
