const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// === DYNAMIC CHROME PATH FINDER ===
async function getChromePath() {
  const baseDir = '/opt/render/.cache/puppeteer/chrome';
  if (!fs.existsSync(baseDir)) return null;

  try {
    const versions = fs.readdirSync(baseDir).filter(d => d.startsWith('linux-'));
    for (const ver of versions) {
      const chromePath = path.join(baseDir, ver, 'chrome-linux64', 'chrome');
      if (fs.existsSync(chromePath)) {
        const stats = fs.statSync(chromePath);
        if (stats.isFile() && (stats.mode & 0o111)) { // Check executable bit
          return chromePath;
        }
      }
    }
  } catch (err) {
    console.error('Error finding Chrome:', err.message);
  }
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
    console.error('Chrome binary not found');
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
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI'
      ],
      timeout: 30000
    });

    const page = await browser.newPage();

    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
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
      // TikTok shows "Couldn't find this account" for non-existent users
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

// === HEALTH CHECK ===
app.get('/', (req, res) => {
  res.send(`
    <h1>TikTok Username Checker API</h1>
    <p><strong>Usage:</strong> <code>/check?username=khaby_lame</code></p>
    <p><strong>Live:</strong> <a href="/check?username=khaby_lame">Test khaby_lame</a></p>
  `);
});

// === START SERVER ===
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
  console.log(`Your service is live!`);
  console.log(`Available at: https://tiktok-username-checker-api.onrender.com`);
});
