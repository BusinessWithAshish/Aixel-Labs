---
name: gcloud-run-functions
description: Build and deploy Google Cloud Run Functions (HTTP) using @google-cloud/functions-framework with Node.js. Covers source-deploy (no Dockerfile), Puppeteer/Chromium setup with the gcp-build trick, function entry point syntax, package.json requirements, local testing, environment variables, and deployment to Cloud Run. Use when writing Cloud Run functions, adding Puppeteer/browser automation to a function, deploying source-based Cloud Run services, or migrating scraping tasks to Google Cloud.
---

# Google Cloud Run Functions (Node.js)

Cloud Run functions use `@google-cloud/functions-framework` as the HTTP entry point. No Dockerfile is needed for source-deploy — Google Cloud Build packages and runs the function automatically.

## Package structure

```
my-function/
├── index.js          # function handler(s)
├── package.json      # must include gcp-build if using Puppeteer
└── .puppeteerrc.cjs  # required for Puppeteer cache (source-deploy only)
```

## Minimal package.json

```json
{
  "name": "my-function",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "functions-framework --target=myHandler"
  },
  "dependencies": {
    "@google-cloud/functions-framework": "^3.4.0",
    "@sparticuz/chromium": "^133.0.0",
    "puppeteer-core": "^24.0.0"
  }
}
```

> **Do NOT use the full `puppeteer` package with a `gcp-build` script.** Cloud Build's network blocks external Chrome binary downloads at build time — the download folder gets created but the binary never lands. Both `install.mjs` and `npx puppeteer browsers install chrome` fail the same way.
>
> Use `@sparticuz/chromium` + `puppeteer-core` instead. Sparticuz bundles the Chromium binary inside the npm package as a compressed tarball. It decompresses at runtime — no external download ever needed during the build.

## HTTP function syntax

```js
const { http } = require('@google-cloud/functions-framework');

// Entry point name must match --target in package.json and the Cloud Run console
http('myHandler', async (req, res) => {
  const body = req.body;   // already JSON-parsed if Content-Type: application/json
  const query = req.query;

  res.status(200).json({ success: true, data: {} });
});
```

## Puppeteer setup — Dockerfile required

Cloud Run services do **not** ship Chromium system libraries in the runtime. You must provide a `Dockerfile` that installs them via `apt-get`. Use `@sparticuz/chromium` + `puppeteer-core` — the binary is bundled in the npm package so no external download happens at build time.

### Dockerfile (minimal, Debian Bookworm / node:20-slim)

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    ca-certificates fonts-liberation \
    libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 \
    libdrm2 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 libgtk-3-0 \
    libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 \
    libxfixes3 libxkbcommon0 libxrandr2 libxrender1 libxss1 libxtst6 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=8080
CMD ["npm", "start"]
```

### Launch code (index.js)

```js
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

chromium.setGraphicsMode = false;

const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: await chromium.executablePath(),
  headless: chromium.headless,
});
```

This is identical to the `backend/src/utils/browser.ts` production path.

> **Cloud Run Functions** (2nd gen / Cloud Run Functions product) DOES include Chrome system deps in its managed runtime — no Dockerfile needed there. **Cloud Run services** (what you get when deploying source via the Cloud Run console) do NOT — Dockerfile is required.

## Environment variables

Set via Cloud Run console (Edit & Deploy Revision → Variables & Secrets) or CLI:

```bash
gcloud run services update SERVICE_NAME \
  --set-env-vars NODE_ENV=production,MY_SECRET=value \
  --region asia-south1
```

For secrets (MongoDB URI, API keys), use Secret Manager and reference them:

```bash
gcloud run services update SERVICE_NAME \
  --set-secrets MONGODB_URI=mongodb-uri:latest \
  --region asia-south1
```

## Local testing

```bash
cd my-function
npm install
npm start
# Function available at http://localhost:8080
```

Test with curl:
```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}'
```

## CPU allocation — critical for Puppeteer

Cloud Run disables CPU after the HTTP response is written. If you launch a browser **after** sending the response it will be extremely slow (1–5 min).

**Always close the browser before `res.json()`**, or enable CPU always:

```
Cloud Run Console → Edit & Deploy Revision → CPU allocation and pricing
→ "CPU is always allocated"
```

## Deploying from Cloud Run Console (source-deploy)

1. Cloud Run Console → Create Service → "Continuously deploy from repository"
2. Select Cloud Build, connect GitHub repo
3. Build Type: `Node.js via buildpacks` (no Dockerfile)
4. Function entry point: the name passed to `http()`, e.g. `myHandler`
5. Configure: Memory 1–2 GiB, CPU 1–2, Timeout 300s, Concurrency 1–5

## Deploying via CLI (one-shot)

```bash
gcloud run deploy SERVICE_NAME \
  --source . \
  --region asia-south1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --concurrency 3 \
  --allow-unauthenticated
```

## Reference

- [Detailed patterns, multi-function setup, proxy auth](reference.md)
