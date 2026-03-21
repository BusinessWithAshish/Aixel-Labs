/**
 * Google Search Inspector — Generic, class-name-free
 * Two structural patterns cover 100% of Google organic results:
 *   Pattern A: <a href="http..."><h3>title</h3></a>  — standard
 *   Pattern B: <h3> and <a href="http..."> are siblings under same parent  — sitelinks/variants
 * Inject vars before running: window.__GSCRAPER__ = { q, totalPages, language, tbs }
 */
(async function () {
    const searchQuery        = window.__GSCRAPER__.searchQuery;
    const totalPages = window.__GSCRAPER__.totalPages;
    const language = window.__GSCRAPER__.language;
    const tbs = window.__GSCRAPER__.tbs;
    const GOOGLE_SEARCH_MAX_RESULTS_PER_PAGE = 10;

  let all = [];

  function extractCards(doc, pageNum) {
      let h3;
      let href;
      let i;
      const results  = [];
      let position = (pageNum - 1) * GOOGLE_SEARCH_MAX_RESULTS_PER_PAGE + 1;
      const seenUrl  = {};
  
      function isExternalHref(href) {
        if (!href || href.indexOf("http") !== 0) return false;
        if (href.indexOf("https://www.google.") === 0) return false;
        return href.indexOf("https://google.") !== 0;

      }
  
      function getSnippet(startEl) {
        let node = startEl.parentElement;
        while (node && node.tagName !== "BODY") {
          const snipEl = node.querySelector("div.VwiC3b");
          if (snipEl) return snipEl.textContent.trim();
          if (node.id === "rso") break;
          node = node.parentElement;
        }
        return null;
      }
  
      function pushResult(url, title, snippet) {
        if (seenUrl[url]) return;
        seenUrl[url] = true;
        results.push({ position: position++, title: title, url: url, snippet: snippet });
      }
  
      // Pattern A: <a href="http..."> directly contains <h3>
      const anchors = doc.querySelectorAll("a[href]");
      for (i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        href = a.getAttribute("href");
        if (!isExternalHref(href)) continue;
        h3 = a.querySelector("h3");
        if (!h3) continue;
        pushResult(href, h3.textContent.trim(), getSnippet(a));
      }
  
      // Pattern B: <h3> whose parent also contains a sibling <a href="http...">
      // Catches sitelinks and some featured result variants
    const h3s = doc.querySelectorAll("h3");
    for (i = 0; i < h3s.length; i++) {
        h3 = h3s[i];
      const parent = h3.parentElement;
      if (!parent) continue;
  
        // Check if h3 is already inside an anchor (already caught by Pattern A)
        if (h3.closest("a[href]")) continue;
  
        // Look for sibling anchor with external href
      const siblingAnchors = parent.querySelectorAll("a[href]");
      for (let j = 0; j < siblingAnchors.length; j++) {
          href = siblingAnchors[j].getAttribute("href");
          if (!isExternalHref(href)) continue;
          pushResult(href, h3.textContent.trim(), getSnippet(h3));
          break; // only take first valid sibling link per h3
        }
      }
  
      return results;
    }
  
    function detectBlock(html, status) {
      if (status === 429)                                      return "status_429";
      if (html.includes("recaptcha"))                         return "recaptcha";
      if (html.includes("detected unusual traffic"))          return "unusual_traffic";
      if (html.includes("enablejs") && html.length < 200000) return "js_challenge_" + html.length + "b";
      return null;
    }
  
    function wait(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
  
    async function fetchPage(pageNum, attempt) {
      attempt = attempt || 0;
      const preDelay = [0, 5000, 15000, 30000][Math.min(attempt, 3)];
      if (preDelay > 0) {
        console.log("[GScraper] ⏳ Waiting " + (preDelay/1000) + "s before page " + pageNum + " attempt " + (attempt+1));
        await wait(preDelay);
      }
  
      const params = new URLSearchParams({
        q: searchQuery,
        start: String((pageNum - 1) * GOOGLE_SEARCH_MAX_RESULTS_PER_PAGE),
        num: String(GOOGLE_SEARCH_MAX_RESULTS_PER_PAGE),
        hl: language,
        filter: "0",
        nfpr: "1",
      });
      if (tbs) params.set("tbs", tbs);
  
      console.log("[GScraper] Fetching page " + pageNum + (attempt ? " (attempt " + (attempt+1) + ")" : ""));

      let html, status;
      try {
        const resp = await fetch("/search?" + params, {
          credentials: "include",
          headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": location.href,
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
          },
        });
        status = resp.status;
        html   = await resp.text();
      } catch (e) {
        console.log("[GScraper] ❌ Network error page " + pageNum + ": " + e.message);
        if (attempt < 3) return fetchPage(pageNum, attempt + 1);
        return null;
      }
  
      console.log("[GScraper] Page " + pageNum + " | status=" + status + " | size=" + html.length + "b");

      const blockReason = detectBlock(html, status);
      if (blockReason) {
        console.log("[GScraper] ⚠️ Blocked page " + pageNum + ": " + blockReason);
        if (attempt < 3) return fetchPage(pageNum, attempt + 1);
        console.log("[GScraper] 🚫 Giving up on page " + pageNum);
        return null;
      }

      const doc = new DOMParser().parseFromString(html, "text/html");
      const cards   = extractCards(doc, pageNum);
      const hasNext = !!doc.querySelector("a#pnnext");
  
      console.log("[GScraper] ✅ Page " + pageNum + " → " + cards.length + " results | hasNext=" + hasNext);
      return { cards: cards, hasNext: hasNext };
    }
  
    // Page 1 — live DOM
    const p1      = extractCards(document, 1);
    const hasNext = !!document.querySelector("a#pnnext");

    console.log("[GScraper] P1 live DOM: " + p1.length + " results | hasNext=" + hasNext);
    all = all.concat(p1);
  
    if (totalPages === 1 || !hasNext) {
      console.log("[GScraper] Done. Total: " + all.length);
      return all;
    }
  
    for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
      await wait(2000);
      const result = await fetchPage(pageNum, 0);
      if (!result) { console.log("[GScraper] ⏭️ Skipping page " + pageNum); continue; }
      all = all.concat(result.cards);
      if (!result.hasNext) { console.log("[GScraper] No more pages after " + pageNum); break; }
    }
  
    console.log("[GScraper] Done. Total: " + all.length + " results");
    return all;
  })()