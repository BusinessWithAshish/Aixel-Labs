# Botasaurus Utilities

## bt Utility

Helper functions for file I/O and data cleaning.

```python
from botasaurus import bt
```

### JSON

```python
data = {"name": "pikachu", "power": 101}
bt.write_json(data, "output")
loaded_data = bt.read_json("output")
```

### Excel

```python
bt.write_excel(data, "output")
loaded_data = bt.read_excel("output")
```

### CSV

```python
bt.write_csv(data, "output")
loaded_data = bt.read_csv("output")
```

### HTML

```python
html_content = "<html><body><h1>Hello</h1></body></html>"
bt.write_html(html_content, "output")
```

### Temporary Files (Debugging)

```python
bt.write_temp_json(data)
bt.write_temp_csv(data)
bt.write_temp_html("<html><body><h1>Hello</h1></body></html>")
```

### Data Cleaning

```python
text = "The price is $19.99 and the website is https://www.example.com"
numbers = bt.extract_numbers(text)    # [19.99]
links = bt.extract_links(text)        # ["https://www.example.com"]
clean = bt.remove_html_tags("<p>Hello</p>")  # "Hello"
```

### Zipping Files

```python
json_filename = bt.write_json(result, 'data')
excel_filename = bt.write_excel(result, 'data')
bt.zip_files([json_filename, excel_filename])
```

### Upload to S3

```python
bt.upload_to_s3('data.json', 'my-bucket', "AWS_ACCESS_KEY", "AWS_SECRET_KEY")
```

### Prompt (Pause Execution)

```python
bt.prompt()  # Pause and wait for user input
```

## Sitemap Module

Extract links from website sitemaps. Accepts homepage URL, direct sitemap link, or `.gz` compressed sitemap.

```python
from botasaurus.sitemap import Sitemap, Filters, Extractors
```

### Get All Links

```python
links = (
    Sitemap("https://www.g2.com/sitemaps/sitemap_index.xml.gz")
    .filter(Filters.first_segment_equals("products"))
    .extract(Extractors.extract_link_upto_second_segment())
    .write_links('g2-products')
)
```

### List Sitemaps

```python
sitemaps = Sitemap("https://www.omkar.cloud/").write_sitemaps('omkar-sitemaps')
```

### Filter Links

```python
links = (
    Sitemap("https://moralstories26.com/")
    .filter(
        Filters.has_exactly_1_segment(),
        Filters.first_segment_not_equals(["about", "privacy-policy", ...]),
    )
    .write_links('moral-stories')
)
```

### Refresh Cache

```python
from botasaurus.cache import Cache

links = (
    Sitemap("https://moralstories26.com/", cache=Cache.REFRESH)
    .write_links('moral-stories')
)
```

## Links Module

Filter and extract from a list of links (similar to Sitemap module):

```python
from botasaurus.links import Links, Filters, Extractors

links = [
    "https://finance.yahoo.com/topic/stock-market-news/",
    "https://finance.yahoo.com/topic/morning-brief/",
    "https://finance.yahoo.com/quote/AAPL/",
    "https://finance.yahoo.com/quote/GOOG/"
]

filtered = (
    Links(links)
    .filter(Filters.first_segment_equals("quote"))
    .extract(Extractors.extract_link_upto_second_segment())
    .write('stocks')
)
```

## LocalStorage Utility

Store key-value pairs that persist between scraper runs:

```python
from botasaurus.local_storage import LocalStorage

LocalStorage.set_item("credits_used", 100)
print(LocalStorage.get_item("credits_used", 0))
```

## soupify Utility

Create BeautifulSoup objects from various sources:

```python
from botasaurus.soupify import soupify

# From Request response
@request
def scrape(req: Request, data):
    response = req.get("https://www.example.com")
    soup = soupify(response)

# From Driver (full page)
@browser
def scrape(driver: Driver, data):
    driver.get("https://www.example.com")
    soup = soupify(driver)

# From Driver Element
    body_soup = soupify(driver.select("body"))

# From HTML string
    soup = soupify(html_string)
```

## IPUtils

Get information about current IP address:

```python
from botasaurus.ip_utils import IPUtils

current_ip = IPUtils.get_ip()
# "47.31.226.180"

ip_info = IPUtils.get_ip_info()
# {
#     "ip": "47.31.226.180",
#     "country": "IN",
#     "region": "Delhi",
#     "city": "Delhi",
#     "postal": "110001",
#     "coordinates": "28.6519,77.2315",
#     "latitude": "28.6519",
#     "longitude": "77.2315",
#     "timezone": "Asia/Kolkata",
#     "org": "AS55836 Reliance Jio Infocomm Limited"
# }
```

## Cache Utility

Manage cached data programmatically:

```python
from botasaurus.cache import Cache

# Basic operations
Cache.put('scrape_data', input_data, result)
if Cache.has('scrape_data', input_data):
    cached = Cache.get('scrape_data', input_data)
Cache.remove('scrape_data', input_data)
Cache.clear('scrape_data')
```

### Count Cached Items

```python
Cache.print_cached_items_count('scraping_function')
```

### Filter Cached/Uncached Items

```python
all_items = ['1', '2', '3', '4', '5']

cached_items = Cache.filter_items_in_cache('scraping_function', all_items)
uncached_items = Cache.filter_items_not_in_cache('scraping_function', all_items)
```

### Delete Specific Items

```python
deleted_count = Cache.delete_items('scraping_function', all_items)
```

### Delete by Filter

```python
def should_delete_item(item, result):
    if 'Honeypot Item' in result:
        return True
    return False

Cache.delete_items_by_filter('scraping_function', should_delete_item, all_items)
```

**Caution**: Test on small set first:

```python
test_items = ['1', '2']
Cache.delete_items_by_filter('scraping_function', test_items, should_delete_item)

for item in test_items:
    if Cache.has('scraping_function', item):
        bt.prompt(f"Item {item} was not deleted. Review should_delete_item logic.")
```

### Cache Storage

Cache stored in `cache/{function_name}/` folder. Delete folder to clear.

## Profiles Utility

Manage all profiles:

```python
from botasaurus.profiles import Profiles

Profiles.set_profile('amit', {'name': 'Amit Sharma', 'age': 30})
Profiles.set_profile('rahul', {'name': 'Rahul Verma', 'age': 30})

profile = Profiles.get_profile('amit')
all_profiles = Profiles.get_profiles()
random_profiles = Profiles.get_profiles(random=True)

Profiles.delete_profile('amit')
```

Profile data stored in `profiles.json` in the current working directory.
