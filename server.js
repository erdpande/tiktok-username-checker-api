const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');

const app = express();
const PORT = process.env.PORT || 10000;

// === HEALTH CHECK ===
app.get('/', (req, res) => {
  res.send(`
    <h1>TikTok Username Checker API</h1>
    <p><strong>Usage:</strong> <code>GET /check?username=khaby_lame</code></p>
    <p><a href="/check?username=khaby_lame">Test: khaby_lame (taken)</a></p>
    <p><a href="/check?username=nonexistentuser1234567890">Test: available</a></p>
    <hr>
    <p><em>Powered by chrome-aws-lambda + puppeteer-core | No cache issues</em></p>
  `);
});

// === MAIN CHECK ROUTE ===
app.get('/check', async (req, res) => {
  const { username } = req.query;

  // Validate input
  if (!username || typeof username !== 'string' || username.trim() === '') {
    return res.status(400).json({ error: 'Invalid or missing username' });
  }

  const cleanUsername = username.trim().toLowerCase();

  let browser = null;

  try {
    // Launch browser using bundled Chrome
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    // Block images, CSS, fonts to speed up
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate to TikTok profile
    await page.goto(`https://www.tiktok.com/@${cleanUsername}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Check if user exists
    const userExists = await page.evaluate(() => {
      const notFound = document.querySelector('div[data-e2e="user-not-found"]');
      return !notFound;
    });

    await browser.close();

    res.json({ available: !userExists });

  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    console.error('Puppeteer error:', error.message);
    res.status(500).json({ error: 'Failed to check username' });
  }
});

// === START SERVER ===
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
  console.log(`Your service is live!`);
  console.log(`Available at: https://tiktok-username-checker-api.onrender.com`);
});


{
  "name": "tiktok-username-checker",
  "version": "1.0.0",
  "description": "Check if TikTok username is available using Puppeteer on Render",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "puppeteer-core": "^22.0.0",
    "chrome-aws-lambda": "^10.1.0"
  },
  "engines": {
    "node": ">=18"
  }
}
