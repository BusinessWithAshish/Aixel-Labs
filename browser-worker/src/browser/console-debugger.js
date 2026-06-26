// ============================================
// 10-PAGE PAGINATION STRESS TEST
// Tests all pages sequentially with delays
// Checks for blocks, CAPTCHAs, result drops
// ============================================
(function() {

    const QUERY = new URLSearchParams(location.search).get('q');
    const DELAY_MS = 1500; // between requests
    const report = {
      query: QUERY,
      pages: [],
      summary: {}
    };
  
    // Parse results from raw HTML string
    function parseResults(html, pageNum) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
  
      const isBlocked = html.includes('detected unusual traffic') 
                     || html.includes('recaptcha')
                     || html.includes('Sorry, we could not process')
                     || html.includes('consent.google.com');
  
      const cards = [...doc.querySelectorAll('div.tF2Cxc')].map((card, i) => ({
        position: ((pageNum - 1) * 10) + i + 1,
        title:      card.querySelector('h3.LC20lb')?.innerText?.trim() || null,
        url:        card.querySelector('a.zReHs')?.href || null,
        displayUrl: card.querySelector('cite.tjvcx')?.innerText?.trim() || null,
        snippet:    card.querySelector('div.VwiC3b')?.innerText?.trim() || null,
      }));
  
      // Check what Google thinks the page title is
      const title = doc.title;
  
      // Check if results count changed (sign of soft-block)
      const stats = doc.querySelector('#result-stats')?.innerText?.trim() || null;
  
      // Check response HTML size (sudden drop = block)
      const htmlSize = html.length;
  
      return { cards, isBlocked, title, stats, htmlSize };
    }
  
    // Build URL for each page
    function buildUrl(page) {
      const params = new URLSearchParams({
        q:     QUERY,
        start: (page - 1) * 10,
        num:   10,
        hl:    'en',
        gl:    'us',
        // These seem optional but add them for safety
        filter: '0',   // disable dedup
        nfpr:   '1',   // disable autocorrect
      });
      return `https://www.google.com/search?${params}`;
    }
  
    // Sequential fetch with delay
    async function fetchAllPages() {
      console.log(`%c🚀 Starting 10-page fetch for: "${QUERY}"`, 'color: lime; font-size: 13px; font-weight: bold');
  
      for (let page = 1; page <= 10; page++) {
        const url = buildUrl(page);
        const startTime = Date.now();
  
        try {
          console.log(`%c⏳ Fetching page ${page}/10...`, 'color: cyan', url);
  
          const res = await fetch(url, {
            credentials: 'include', // send cookies
            headers: {
              'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer':          page === 1 
                                    ? 'https://www.google.com/' 
                                    : buildUrl(page - 1),
              'Cache-Control':   'no-cache',
            }
          });
  
          const html = await res.text();
          const elapsed = Date.now() - startTime;
          const parsed = parseResults(html, page);
  
          const pageReport = {
            page,
            url,
            httpStatus:    res.status,
            htmlSize:      parsed.htmlSize,
            resultCount:   parsed.cards.length,
            isBlocked:     parsed.isBlocked,
            pageTitle:     parsed.title,
            totalResults:  parsed.stats,
            elapsedMs:     elapsed,
            results:       parsed.cards,
          };
  
          report.pages.push(pageReport);
  
          // Log summary for this page
          const statusEmoji = parsed.isBlocked ? '🚫' : parsed.cards.length === 0 ? '⚠️' : '✅';
          console.log(
            `%c${statusEmoji} Page ${page}: ${parsed.cards.length} results | ${parsed.htmlSize} bytes | ${elapsed}ms | blocked: ${parsed.isBlocked}`,
            parsed.isBlocked ? 'color: red' : parsed.cards.length === 0 ? 'color: orange' : 'color: lime'
          );
  
          if (parsed.isBlocked) {
            console.warn(`🚫 BLOCKED on page ${page}! Stopping.`);
            break;
          }
  
          if (parsed.cards.length === 0) {
            console.warn(`⚠️ No results on page ${page} — possible soft block or end of results`);
          }
  
          // Delay before next request
          if (page < 10) {
            console.log(`%c💤 Waiting ${DELAY_MS}ms before next request...`, 'color: gray');
            await new Promise(r => setTimeout(r, DELAY_MS));
          }
  
        } catch(err) {
          console.error(`❌ Page ${page} fetch error:`, err.message);
          report.pages.push({ page, error: err.message });
        }
      }
  
      // ── Final Summary ─────────────────────────
      const successful   = report.pages.filter(p => p.resultCount > 0);
      const blocked      = report.pages.filter(p => p.isBlocked);
      const totalResults = report.pages.reduce((sum, p) => sum + (p.resultCount || 0), 0);
      const avgHtmlSize  = Math.round(report.pages.reduce((s, p) => s + (p.htmlSize || 0), 0) / report.pages.length);
  
      report.summary = {
        totalPages:       report.pages.length,
        successfulPages:  successful.length,
        blockedPages:     blocked.length,
        totalResults,
        avgHtmlSize,
        avgElapsedMs:     Math.round(report.pages.reduce((s, p) => s + (p.elapsedMs || 0), 0) / report.pages.length),
        // Key for Node.js: what HTML size signals a real result page vs block
        htmlSizeRange: {
          min: Math.min(...report.pages.map(p => p.htmlSize || 0)),
          max: Math.max(...report.pages.map(p => p.htmlSize || 0)),
        }
      };
  
      console.log('%c\n📊 FINAL SUMMARY', 'color: lime; font-size: 14px; font-weight: bold');
      console.table(report.pages.map(p => ({
        page:        p.page,
        results:     p.resultCount,
        htmlKB:      p.htmlSize ? Math.round(p.htmlSize/1024) + 'KB' : 'ERR',
        blocked:     p.isBlocked,
        ms:          p.elapsedMs,
      })));
      console.log('%c📋 Summary:', 'color: cyan', report.summary);
      console.log('%c📋 Full report (copy this):', 'color: yellow');
      console.log(JSON.stringify(report.summary, null, 2));
  
      // Store all results flat
      window.__allResults = report.pages.flatMap(p => p.results || []);
      window.__fullReport = report;
      console.log(`%c✅ All results stored in window.__allResults (${window.__allResults.length} total)`, 'color: lime');
    }
  
    fetchAllPages();
  })();