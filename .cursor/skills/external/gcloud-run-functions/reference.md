# Cloud Run Functions — Reference

## Multiple functions in one deployment

Export multiple handlers from the same `index.js`. Cloud Run only invokes the one you specify as the entry point — but you can deploy separately with different `--target` values pointing to the same repo.

```js
const { http } = require('@google-cloud/functions-framework');

http('gsearch', async (req, res) => { /* ... */ });
http('gmaps',   async (req, res) => { /* ... */ });
```

Deploy two services from the same source:
```bash
gcloud run deploy gsearch-engine --source . --function gsearch --region asia-south1
gcloud run deploy gmaps-engine   --source . --function gmaps   --region asia-south1
```

## Proxy authentication inside Puppeteer

Pass proxy server at launch, then authenticate per page:

```js
const browser = await puppeteer.launch({
  args: [
    '--proxy-server=http://HOST:PORT',
    // ... other args
  ],
});

const page = await browser.newPage();
await page.authenticate({ username: 'user', password: 'pass' });
```

For Evomi residential proxies (matching backend pattern):

```js
const proxyPassword = `${process.env.EVOMI_PROXY_PASSWORD}_country-${country}`;
await page.authenticate({
  username: process.env.EVOMI_PROXY_USERNAME,
  password: proxyPassword,
});
```

## Error handling pattern

Always close the browser in a `finally` block. Leaked browser processes exhaust Cloud Run instance memory.

```js
http('myHandler', async (req, res) => {
  let browser = null;
  try {
    browser = await puppeteer.launch({ /* ... */ });
    const page = await browser.newPage();

    // ... scraping logic

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[Function] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});
```

## Request timeout vs Cloud Run timeout

Cloud Run timeout (set on the service) is the max time for the entire request. Set it ≥ your expected scrape time. Default is 300s; max is 3600s.

```bash
gcloud run services update SERVICE_NAME --timeout 600 --region asia-south1
```

Inside the function, keep your Puppeteer `page.goto` timeout lower than the Cloud Run timeout so you get a clean error instead of a hard kill:

```js
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
```

## Calling the function from the Express backend

The Cloud Run service exposes a public HTTPS URL. Call it from your existing Express handlers:

```ts
// In your Express handler (backend/src/api/gsearch/handler.ts)
const GSEARCH_FUNCTION_URL = process.env.GSEARCH_FUNCTION_URL;

const response = await fetch(GSEARCH_FUNCTION_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(req.body),
  signal: AbortSignal.timeout(120_000),
});
const data = await response.json();
res.json(data);
```

## IAM — making the function private

Remove `--allow-unauthenticated` to make it private. Then call it with an identity token:

```bash
# Get token for the calling service's service account
TOKEN=$(gcloud auth print-identity-token --audiences=FUNCTION_URL)
curl -H "Authorization: Bearer $TOKEN" FUNCTION_URL
```

Or grant the Express backend's service account `roles/run.invoker` on the function service.

## Memory sizing guide

| Workload | Recommended memory |
|----------|--------------------|
| Single page, no browser | 256 MiB |
| Single Puppeteer page | 1 GiB |
| Multi-page scrape (2–5 tabs) | 2 GiB |
| Heavy SERP scraping | 4 GiB |

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Failed to set up chrome` / `Failed to set up chrome-headless-shell` | Cloud Build's network blocks external Chrome binary downloads; the download folder is created but the binary never lands | Switch to `@sparticuz/chromium` + `puppeteer-core` — the binary is bundled in the npm package, no network download at build time |
| `libnss3.so: cannot open shared object file` | Cloud Run service runtime (buildpacks) doesn't include Chromium system libraries | Add a `Dockerfile` with `apt-get install libnss3 libatk-bridge2.0-0 libgbm1 ...` — see Dockerfile in SKILL.md |
| `Error: spawn ENOENT` | Wrong `executablePath` or missing Chrome | Remove custom `executablePath` — let Puppeteer find it via `.puppeteerrc.cjs` |
| Function very slow after first request | CPU throttled post-response | Enable "CPU always allocated" on the service |
| `SIGTERM` mid-scrape | Cloud Run timeout hit | Increase service timeout, reduce scrape scope per request |
| `net::ERR_PROXY_CONNECTION_FAILED` | Proxy args not matching proxy provider format | Double-check proxy URL format, port, and credential rotation |
