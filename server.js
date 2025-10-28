const express = require('express');
const puppeteer = require('puppeteer-extra');
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json({ limit: '10mb' }));

// Helper: Check one username
async function checkUsername(username, page) {
  try {
    await page.goto(`https://www.tiktok.com/@${username}`, {
      waitUntil: 'networkidle2',
      timeout: 10000
    });

    const notFoundText = await page.evaluate(() => {
      const p = Array.from(document.querySelectorAll('p')).find(el =>
        el.innerText.toLowerCase().includes('couldn’t find this account') ||
        el.innerText.toLowerCase().includes('this account doesn’t exist')
      );
      return p ? p.innerText : null;
    });

    return { username, available: !!notFoundText };
  } catch (err) {
    return { username, available: false, error: 'Rate limited or timeout' };
  }
}

// === SINGLE CHECK ===
app.post('/check', async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Invalid username' });
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  const result = await checkUsername(username.trim(), page);
  await browser.close();

  res.json(result);
});

// === BULK CHECK (up to 100) ===
app.post('/bulk-check', async (req, res) => {
  let { usernames } = req.body;
  if (!Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({ error: 'Send array of usernames' });
  }

  usernames = usernames.slice(0, 100).map(u => u.toString().trim()).filter(Boolean);
  if (usernames.length === 0) {
    return res.status(400).json({ error: 'No valid usernames' });
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const results = [];

  for (const username of usernames) {
    const result = await checkUsername(username, page);
    results.push(result);
    // Small delay to avoid detection
    await new Promise(r => setTimeout(r, 300));
  }

  await browser.close();
  res.json({ count: results.length, results });
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'TikTok Username Checker API Live', endpoints: ['/check', '/bulk-check'] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
