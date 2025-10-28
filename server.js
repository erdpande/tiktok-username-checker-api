const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send(`
    <h1>TikTok Username Checker</h1>
    <p><code>/check?username=khaby_lame</code></p>
  `);
});

app.get('/check', async (req, res) => {
  const { username } = req.query;

  if (!username || typeof username !== 'string' || username.trim() === '') {
    return res.status(400).json({ error: 'Invalid username' });
  }

  const cleanUsername = username.trim().toLowerCase();

  let browser = null;

  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    console.log('Navigating to TikTok...');
    await page.goto(`https://www.tiktok.com/@${cleanUsername}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const userExists = await page.evaluate(() => {
      return !document.querySelector('div[data-e2e="user-not-found"]');
    });

    await browser.close();
    console.log('Check complete:', { username, available: !userExists });

    res.json({ available: !userExists });

  } catch (error) {
    console.error('PUPPETEER LAUNCH FAILED:', error.message);
    console.error('STACK:', error.stack);
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({ error: 'Failed to check username' });
  }
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
  console.log(`Live: https://tiktok-username-checker-api.onrender.com`);
});
