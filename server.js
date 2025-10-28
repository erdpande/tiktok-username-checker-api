const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// === ENSURE CACHE DIRECTORY EXISTS AT RUNTIME ===
const CACHE_DIR = '/opt/render/.cache/puppeteer';
if (!fs.existsSync(CACHE_DIR)) {
  console.log('Creating cache directory at runtime:', CACHE_DIR);
  require('child_process').execSync(`mkdir -p ${CACHE_DIR}`);
}

// === DYNAMIC CHROME PATH FINDER (RENDER-OPTIMIZED) ===
async function getChromePath() {
  const cacheDir = process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer';
  console.log('PUPPETEER_CACHE_DIR:', cacheDir);

  if (!fs.existsSync(cacheDir)) {
  console.log('Cache directory missing:', cacheDir);
  return null;
}

  const chromeBase = path.join(cacheDir, 'chrome');
  if (!fs.existsSync(chromeBase)) {
    console.log('Chrome base missing:', chromeBase);
    return null;
  }

  try {
    const versions = fs.readdirSync(chromeBase);
    console.log('Chrome versions:', versions);

    for (const ver of versions) {
      const chromePath = path.join(chromeBase, ver, 'chrome-linux64', 'chrome');
      console.log('Checking:', chromePath);
      if (fs.existsSync(chromePath)) {
        const stats = fs.statSync(chromePath);
        if (stats.isFile() && (stats.mode & 0o111)) {
          console.log('CHROME FOUND:', chromePath);
          return chromePath;
        }
      }
    }
  } catch (err) {
    console.error('Scan error:', err.message);
  }

  console.log('Chrome not found');
  return null;
}

// === MAIN API ROUTE ===
app.get('/check', async (req, res) => {
  const { username } = req.query;

  // Validate input
  if (!username || typeof username !== 'string' || username.trim() === '') {
    return res.status(400).json({ error: 'Invalid or missing username' });
  }

  const cleanUsername = username.trim().toLowerCase();

  // Find Chrome
  const chromePath = await getChromePath();
  if (!chromePath) {
    return res.status(500).json({ error: 'Browser not available' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding'
      ],
      timeout: 30000
    });

    const page = await browser.newPage();

    // Block images, CSS, fonts
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Go to TikTok profile
    await page.goto(`https://www.tiktok.com/@${cleanUsername}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    // Check if user exists
    const userExists = await page.evaluate(() => {
      const notFound = document.querySelector('div[data-e2e="user-not-found"]');
      return !notFound;
    });

    await browser.close();

    res.json({ available: !userExists });

  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    console.error('Puppeteer error:', err.message);
    res.status(500).json({ error: 'Failed to check username' });
  }
});

// === ROOT / HEALTH CHECK ===
app.get('/', (req, res) => {
  res.send(`
    <h1>TikTok Username Checker API</h1>
    <p><strong>Usage:</strong> <code>GET /check?username=khaby_lame</code></p>
    <p><a href="/check?username=khaby_lame">Test: khaby_lame (taken)</a></p>
    <p><a href="/check?username=nonexistentuser1234567890">Test: available</a></p>
    <hr>
    <p><em>Built for Render.com | Puppeteer + Express</em></p>
  `);
});

// === START SERVER ===
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
  console.log(`Your service is live!`);
  console.log(`Available at: https://tiktok-username-checker-api.onrender.com`);
});
