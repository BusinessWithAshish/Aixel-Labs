# UI Scraper

Build scrapers with a beautiful web UI accessible at `http://localhost:3000/`.

## Benefits

- Non-technical users can run scrapers via browser
- Protect code by hosting as a subscription service
- Sort, filter, download data in JSON/Excel/CSV
- REST API access
- Polished frontend/backend with minimal code

## Setup with Starter Template

```bash
git clone https://github.com/omkarcloud/botasaurus-starter my-botasaurus-project
cd my-botasaurus-project
python -m pip install -r requirements.txt
python run.py install
python run.py
```

Opens at http://localhost:3000/. Key pages:
- `/` — Run scraper
- `/output` — View all tasks
- `/about` — Rendered README.md
- `/api-integration` — Auto-generated API docs

## Creating a UI Scraper (3 Steps)

### Step 1: Create Scraper Function

`src/scrape_heading_task.py`:

```python
from botasaurus.request import request, Request
from botasaurus.soupify import soupify

@request
def scrape_heading_task(request: Request, data):
    response = request.get(data["link"])
    soup = soupify(response)
    heading = soup.find('h1').get_text()
    return {"heading": heading}
```

### Step 2: Register Scraper

`backend/scrapers.py`:

```python
from botasaurus_server.server import Server
from src.scrape_heading_task import scrape_heading_task

Server.add_scraper(scrape_heading_task)
```

### Step 3: Define Input Controls

`backend/inputs/scrape_heading_task.js`:

```js
/**
 * @typedef {import('../../frontend/node_modules/botasaurus-controls/dist/index').Controls} Controls
 */

/**
 * @param {Controls} controls
 */
function getInput(controls) {
    controls
        .link('link', { isRequired: true, defaultValue: "https://stackoverflow.blog/open-source" })
}
```

Template for new input files:

```js
/**
 * @typedef {import('../../frontend/node_modules/botasaurus-controls/dist/index').Controls} Controls
 */

/**
 * @param {Controls} controls
 */
function getInput(controls) {
    // Define your controls here.
}
```

### Complex Input Controls Example

```js
function getInput(controls) {
    controls
        .listOfTexts('queries', {
            defaultValue: ["Web Developers in Bangalore"],
            placeholder: "Web Developers in Bangalore",
            label: 'Search Queries',
            isRequired: true
        })
        .section("Email and Social Links Extraction", (section) => {
            section.text('api_key', {
                placeholder: "2e5d346ap4db8mce4fj7fc112s9h26s61e1192b6a526af51n9",
                label: 'Email and Social Links Extraction API Key',
                helpText: 'Enter your API key to extract email addresses and social media links.',
            })
        })
        .section("Reviews Extraction", (section) => {
            section
                .switch('enable_reviews_extraction', { label: "Enable Reviews Extraction" })
                .numberGreaterThanOrEqualToZero('max_reviews', {
                    label: 'Max Reviews per Place (Leave empty to extract all reviews)',
                    placeholder: 20,
                    isShown: (data) => data['enable_reviews_extraction'],
                    defaultValue: 20,
                })
                .choose('reviews_sort', {
                    label: "Sort Reviews By",
                    isRequired: true,
                    isShown: (data) => data['enable_reviews_extraction'],
                    defaultValue: 'newest',
                    options: [
                        { value: 'newest', label: 'Newest' },
                        { value: 'most_relevant', label: 'Most Relevant' },
                        { value: 'highest_rating', label: 'Highest Rating' },
                        { value: 'lowest_rating', label: 'Lowest Rating' }
                    ]
                })
        })
        .section("Language and Max Results", (section) => {
            section
                .addLangSelect()
                .numberGreaterThanOrEqualToOne('max_results', {
                    placeholder: 100,
                    label: 'Max Results per Search Query (Leave empty to extract all places)'
                })
        })
        .section("Geo Location", (section) => {
            section
                .text('coordinates', { placeholder: '12.900490, 77.571466' })
                .numberGreaterThanOrEqualToOne('zoom_level', {
                    label: 'Zoom Level (1-21)',
                    defaultValue: 14,
                    placeholder: 14
                })
        })
}
```

## Filters

Add to `backend/scrapers.py`:

```python
from botasaurus_server.server import Server
from botasaurus_server.ui import filters

all_filters = [
    filters.SearchTextInput("name"),
    filters.MinNumberInput("reviews", label="Minimum Reviews"),
    filters.MaxNumberInput("price"),
    filters.SingleSelectDropdown("category", options=[
        {"value": "apparel", "label": "Apparel"},
        {"value": "electronics", "label": "Electronics"}
    ]),
    filters.MultiSelectDropdown("tags", options=[
        {"value": "cotton", "label": "Cotton"},
        {"value": "casual", "label": "Casual"},
    ]),
    filters.IsTrueCheckbox("is_available", label="Is Available"),
    filters.IsFalseCheckbox("is_available"),
    filters.IsNullCheckbox("description"),
    filters.IsNotNullCheckbox("description"),
    filters.BoolSelectDropdown("is_available"),
]

Server.add_scraper(scrape_product_data, filters=all_filters)
```

### All Filter Types

| Filter | Description |
|--------|-------------|
| `SearchTextInput(field)` | Contains search term |
| `MinNumberInput(field)` | >= specified value |
| `MaxNumberInput(field)` | <= specified value |
| `IsTrueCheckbox(field)` | Field is `True` |
| `IsFalseCheckbox(field)` | Field is `False` |
| `IsNullCheckbox(field)` | Field is `None` |
| `IsNotNullCheckbox(field)` | Field is not `None` |
| `SingleSelectDropdown(field, options)` | Match single selection (works with string or list of strings) |
| `MultiSelectDropdown(field, options)` | Match multiple selections |
| `BoolSelectDropdown(field)` | Yes (truthy) / No (falsy) |

## Sorts

```python
from botasaurus_server.ui import sorts

all_sorts = [
    sorts.AlphabeticAscendingSort("name"),
    sorts.Sort(
        label="Top Products",
        is_default=True,
        sorts=[
            sorts.AlphabeticAscendingSort("name"),
            sorts.NumericDescendingSort("reviews"),
            sorts.TrueFirstSort("is_available")
        ]
    )
]

Server.add_scraper(scrape_product_data, sorts=all_sorts)
```

### All Sort Types

| Sort | Description |
|------|-------------|
| `NumericAscendingSort(field)` | Ascending numeric |
| `NumericDescendingSort(field)` | Descending numeric |
| `AlphabeticAscendingSort(field)` | A-Z |
| `AlphabeticDescendingSort(field)` | Z-A |
| `TrueFirstSort(field)` | True values first |
| `FalseFirstSort(field)` | False values first |
| `TruthyFirstSort(field)` | Truthy values first |
| `FalsyFirstSort(field)` | Falsy values first |
| `NullsFirstSort(field)` | None values first |
| `NullsLastSort(field)` | None values last |
| `NewestDateFirstSort(field)` | Newest date first |
| `OldestDateFirstSort(field)` | Oldest date first |
| `Sort(label, sorts=[...])` | Composite sort with multiple criteria |

## Views

Present data in different formats:

```python
from botasaurus_server.ui import View, Field, CustomField, ExpandDictField, ExpandListField

def calculate_average_rating(value, record):
    total_reviews = sum(value.values())
    if total_reviews == 0:
        return 0
    rating_sum = sum(int(rating) * count for rating, count in value.items())
    return rating_sum / total_reviews

overview_view = View(
    "Overview",
    fields=[
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
    ]
)

featured_reviews_view = View(
    "Featured Reviews",
    fields=[
        Field("id", output_key="product_id"),
        Field("name", output_key="product_name"),
        ExpandListField("featured_reviews", fields=[
            Field("rating"),
            Field("content"),
        ]),
    ],
)

Server.add_scraper(scrape_product_data, views=[overview_view, featured_reviews_view])
```

### Field Types

| Type | Description |
|------|-------------|
| `Field(key)` | Display a single field. Options: `output_key`, `map(value, record)`, `show_if(input_data)` |
| `CustomField(key, map)` | Derive field from multiple fields: `map=lambda record: f"{record['first_name']} {record['last_name']}"` |
| `ExpandDictField(key, fields)` | Expand dictionary into separate fields |
| `ExpandListField(key, fields)` | Expand list items into separate rows |

### Applying Views Programmatically

```python
from botasaurus_server.ui import View, Field
from botasaurus import bt

def write_output(input_data, result):
    bt.write_excel(overview_view.apply(result), 'overview')
    bt.write_json(result, 'products')

@task(output=write_output)
def scrape_product_data(data):
    return products
```

### Applying Sorts Programmatically

```python
sort = sorts.AlphabeticAscendingSort("name")
bt.write_json(sort.apply(result), 'sorted')
```

## Server Configuration

### Custom Title/Description

```python
Server.configure(
    title="My Scraper",
    header_title="Heading Scraper",
    description="Heading Scraper helps you extract headings from links",
    right_header={
        "text": "Need Help? Mail Us!",
        "link": "mailto:chetan@chetan.com",
    },
)
```

### Rate Limiting

```python
Server.set_rate_limit(browsers=1, requests=30)
```

Extra tasks beyond the limit are queued in order.

### Task Naming

```python
def get_task_name(data):
    return data["link"]

Server.add_scraper(scrape_product_data, get_task_name=get_task_name)
```

### Split Tasks

Divide multi-URL input into separate tasks:

```python
def split_task(data):
    return data["links"]

Server.add_scraper(scrape_product_data, split_task=split_task)
```

### Create All Task

Combined results task from split tasks:

```python
Server.add_scraper(
    scrape_product_data,
    split_task=split_task,
    create_all_task=True,
)
```

## Database Configuration

Default: SQLite. For large datasets with concurrency, use PostgreSQL:

```python
Server.set_database_url('postgresql://user:password@localhost:5432/dbname')
```

### PostgreSQL Recommendations

**Local development**: Supabase free tier (0.5 GB, easy setup). Not for production (Pro plan only 8 GB).

**Production**: Google Cloud SQL
- ~$10/month for 10 GB storage, 1 shared vCPU, 0.6 GB RAM
- Pay-as-you-go pricing ($0.2/GB per month storage)
- Automatic storage increases

**Note**: Restart the application after changing filters, sorts, or views.
