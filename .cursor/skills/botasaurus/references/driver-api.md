# Botasaurus Driver API Reference

Complete reference for the Botasaurus Driver (used with `@browser`). The Driver is a humane, anti-detection browser automation driver.

```python
from botasaurus.browser import browser, Driver, Wait, cdp
```

## Navigation

```python
driver.get("https://www.example.com")
driver.google_get("https://www.example.com")  # Google as referer (recommended)
driver.get_via("https://www.example.com", referer="https://duckduckgo.com/")  # Custom referer
driver.get_via_this_page("https://www.example.com")  # Current page as referer

# Cloudflare bypass
driver.google_get("https://nopecha.com/demo/cloudflare", bypass_cloudflare=True)

# Accept Google cookies popup
driver.google_get(link, accept_google_cookies=True)
```

## Finding Elements

```python
# select: returns element or None after waiting
search_results = driver.select(".search-results", wait=Wait.SHORT)   # 4 seconds
search_results = driver.select(".search-results", wait=Wait.LONG)    # 8 seconds
search_results = driver.select(".search-results", wait=Wait.VERY_LONG) # 16 seconds

# Select all matching elements
all_links = driver.select_all("a")

# Wait and raise exception if not found
element = driver.wait_for_element(".search-results", wait=Wait.LONG)

# Find by text
hello_mom = driver.get_element_with_exact_text("Hello Mom", wait=Wait.VERY_LONG)
error_msg = driver.get_element_containing_text("Error: Invalid input")

# Find element at coordinates
element = driver.get_element_at_point(160, 290)
```

## AntiDetectDriver Legacy Methods

These methods are from the older AntiDetectDriver API (Selenium-based) and may still appear in older code:

```python
element = driver.get_element_or_none("//div[@class='example']")           # XPath
element = driver.get_element_or_none_by_selector(".example-class")        # CSS
element = driver.get_element_or_none_by_text_contains("Example")          # Text search
```

## Interacting with Elements

```python
driver.type("input[name='username']", "john_doe")    # Type into input
driver.click("button.submit")                         # Click element

element = driver.select("button.submit")
element.click()                                        # Click on element

# Select dropdown option
element.select_option("select#fruits", index=2)
```

## Retrieving Properties

```python
header_text = driver.get_text("h1")                    # Get text content
image_url = driver.select("img.logo").get_attribute("src")  # Get attribute
page_html = driver.page_html                            # Full page HTML
links = driver.links('a.post-link')                     # All href values matching selector
all_links = driver.get_all_links('[role="feed"] > div > div > a')
```

## Parent-Child Elements

```python
parent = driver.select(".parent")
child = parent.select(".child")
child.click()
```

## Scrolling

```python
driver.select(".footer").scroll_into_view()
driver.scroll_to_bottom('[role="feed"]')               # Scroll container to bottom
```

## JavaScript Execution

```python
result = driver.run_js("return document.title")
result = driver.run_js("script.js")                     # Run JS file from CWD
pikachu = driver.run_js("return args.pokemon", {"pokemon": 'pikachu'})

# Run JS on an element
text = driver.select("body").run_js("(el) => el.textContent")
```

## CDP Commands

```python
from botasaurus.browser import cdp
driver.run_cdp_command(cdp.page.navigate(url='https://stackoverflow.blog/open-source'))
```

## Human Mode

Enable human-like mouse movements to bypass detection:

```python
driver.enable_human_mode()

# Example: solving Cloudflare Turnstile
driver.get("https://nopecha.com/demo/cloudflare")
driver.long_random_sleep()
iframe = driver.get_element_at_point(160, 290)
checkbox = iframe.get_element_at_point(30, 30)
driver.enable_human_mode()
checkbox.click()
driver.disable_human_mode()
driver.prompt()
```

## Drag and Drop

```python
driver.get("https://react-dnd.github.io/react-dnd/examples/tutorial")
draggable = driver.select('[draggable="true"]')
droppable = driver.select('[data-testid="(3,6)"]')
draggable.drag_and_drop_to(droppable)
driver.prompt()
```

## Shadow DOM

```python
driver.get("https://nopecha.com/demo/cloudflare")
driver.long_random_sleep()
shadow_root_element = driver.select('[name="cf-turnstile-response"]').parent
iframe = shadow_root_element.get_shadow_root()
content = iframe.get_shadow_root()
print(content.select("label", wait=8).text)
driver.prompt()
```

## Iframes

```python
driver.get("https://www.freecodecamp.org/news/using-entity-framework-core-with-mongodb/")
iframe = driver.get_iframe_by_link("www.youtube.com/embed")
# OR: iframe = driver.select_iframe(".embed-wrapper iframe")
subscribers = iframe.select(".ytp-title-expanded-subtitle").text
print(subscribers)
```

## Monitoring Requests

```python
from botasaurus.browser import browser, Driver, cdp

@browser()
def scrape_responses(driver: Driver, data):
    def after_response_handler(request_id, response, event):
        url = response.url
        status = response.status
        headers = response.headers
        print("Response:", {"request_id": request_id, "url": url, "status": status})
        driver.responses.append(request_id)

    driver.after_response_received(after_response_handler)
    driver.get("https://example.com/")
    collected = driver.responses.collect()
    return collected

scrape_responses()
```

## Browser Fetch API (Reduced Proxy Costs)

Make requests through the browser's fetch API to use compressed HTML (saves up to 97% bandwidth):

```python
@browser(reuse_driver=True, max_retry=5)
def scrape(driver: Driver, link):
    if driver.config.is_new:
        driver.google_get(link)

    response = driver.requests.get(link)
    response.raise_for_status()
    html = response.text
    soup = soupify(html)
    return {...}
```

Parallel fetch requests:

```python
responses = driver.requests.get_mank(links)  # Multiple requests in parallel
```

Handling rate limits (429):

```python
driver.sleep(1.13)
response = driver.requests.get(link)
```

Handling large cookies (400):

```python
response = driver.requests.get(link)
if response.status_code == 400:
    driver.delete_cookies()
    driver.short_random_sleep()
    response = driver.requests.get(link)
```

## Cookies

```python
cookies = driver.get_cookies_dict()
driver.delete_cookies()
```

## Random Sleep

```python
driver.short_random_sleep()   # Short random delay
driver.long_random_sleep()    # Longer random delay
driver.sleep(1.13)            # Specific delay
```

## Pause for Debugging

```python
driver.prompt()  # Pauses and waits for user input
```

## Screenshots

```python
driver.save_screenshot()  # Saves to output/ directory
```

## Element Presence Check

```python
exists = driver.is_element_present(".button")       # Returns True/False
container.is_element_present(".button")              # Check within container
```

## Page Check

```python
is_in_page = driver.is_in_page('/search', wait=8)   # Check if URL matches path
```

## Bot Detection Check

```python
is_detected = driver.is_bot_detected()  # Check Cloudflare/PerimeterX triggers
```

## Local Storage

```python
driver.local_storage.set_item('username', 'johndoe')
username = driver.local_storage.get_item('username')
driver.local_storage.remove_item('username')
driver.local_storage.clear()
```

## Profile Data

```python
# Set profile data
driver.profile = {'name': 'Amit Sharma', 'age': 30}
driver.profile['name'] = 'Amit Verma'
del driver.profile['age']
print(driver.profile)
driver.profile = None  # Delete entire profile
```

## BeautifulSoup from Driver

```python
from botasaurus.soupify import soupify

soup = soupify(driver)                    # From driver (full page)
soup = soupify(driver.select("body"))     # From element
```

## Close Browser

```python
driver.close()
```
