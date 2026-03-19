import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, 'debug-screenshots');

const BASE_URL = 'https://ca.apm.activecommunities.com/richmondhill';
const USER_ID = process.env.USER_ID;
const PASSWORD = process.env.PASSWORD;

// Search parameters
const SEARCH_KEYWORD = 'Pickleball';
const MIN_AGE = '40';
const MAX_AGE = '50';
const MIN_SPOTS = 1;

async function saveScreenshot(page, name) {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
  const filePath = path.join(SCREENSHOTS_DIR, `${Date.now()}-${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`[debug] Screenshot saved: ${name}.png`);
}

async function tryClick(page, selectors, description) {
  for (const sel of selectors) {
    try {
      await page.click(sel, { timeout: 4000 });
      console.log(`[ok] Clicked: ${description} (${sel})`);
      return true;
    } catch (_) {}
  }
  console.warn(`[warn] Could not click: ${description}`);
  return false;
}

async function tryFill(page, selectors, value, description) {
  for (const sel of selectors) {
    try {
      await page.fill(sel, value, { timeout: 4000 });
      console.log(`[ok] Filled: ${description} (${sel})`);
      return true;
    } catch (_) {}
  }
  console.warn(`[warn] Could not fill: ${description}`);
  return false;
}

async function login(page) {
  console.log('[step] Navigating to home page...');
  await page.goto(`${BASE_URL}/Home`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(2000);
  await saveScreenshot(page, '01-home');

  // Click Sign In
  const signInClicked = await tryClick(
    page,
    [
      'a:has-text("Sign In")',
      'a:has-text("Log In")',
      'button:has-text("Sign In")',
      '[class*="signin"] a',
      '[class*="login"] a',
      'a[href*="signin"]',
      'a[href*="login"]',
      '.an-user-nav a',
      '.header-signin',
    ],
    'Sign In button'
  );

  await page.waitForTimeout(2000);
  await saveScreenshot(page, '02-after-signin-click');

  // Fill email
  const emailFilled = await tryFill(
    page,
    [
      'input[type="email"]',
      'input[name="email"]',
      'input[name="username"]',
      'input[id*="email" i]',
      'input[id*="username" i]',
      'input[placeholder*="email" i]',
      'input[placeholder*="username" i]',
      '#ctl00_MainContent_txtUserName',
      '#txtUserName',
    ],
    USER_ID,
    'email/username field'
  );

  if (!emailFilled) {
    await saveScreenshot(page, '03-no-email-input');
    throw new Error(
      'Login failed: could not find email input. Check debug-screenshots/ for details.'
    );
  }

  // Fill password
  await tryFill(
    page,
    ['input[type="password"]', '#txtPassword', 'input[name="password"]'],
    PASSWORD,
    'password field'
  );

  await saveScreenshot(page, '03-credentials-filled');

  // Submit login
  await tryClick(
    page,
    [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Sign In")',
      'button:has-text("Log In")',
      'button:has-text("Login")',
      '#btnLogin',
      '#ctl00_MainContent_btnLogin',
    ],
    'login submit button'
  );

  await page.waitForTimeout(4000);
  await saveScreenshot(page, '04-after-login');
  console.log(`[step] Post-login URL: ${page.url()}`);

  // Verify login succeeded by checking for user-specific elements
  const loggedIn = await page
    .locator(
      '[class*="user-name"], [class*="username"], [class*="account"], a:has-text("Sign Out"), a:has-text("Log Out"), a:has-text("My Account")'
    )
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (!loggedIn) {
    console.warn(
      '[warn] Could not confirm login success. Proceeding anyway...'
    );
  } else {
    console.log('[ok] Login confirmed.');
  }
}

async function navigateToActivitySearch(page) {
  console.log('[step] Navigating to Activity Search...');

  // Try direct URL first
  await page.goto(`${BASE_URL}/Activity_Search`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(2000);
  await saveScreenshot(page, '05-activity-search-page');

  // If redirected away, try clicking through the nav
  if (!page.url().includes('Activity_Search')) {
    console.log('[info] Direct URL failed, trying navigation menu...');
    await tryClick(
      page,
      [
        'a:has-text("Activity Registration")',
        'a:has-text("Programs")',
        'a:has-text("Activities")',
        'nav a[href*="Activity"]',
      ],
      'Activity Registration menu'
    );
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '05b-after-nav-click');
  }
}

async function performSearch(page) {
  console.log('[step] Filling in search form...');

  // Keyword
  await tryFill(
    page,
    [
      '#txtKeyword',
      'input[name*="keyword" i]',
      'input[placeholder*="keyword" i]',
      'input[placeholder*="activity name" i]',
      'input[placeholder*="search" i]',
      'input[type="search"]',
      '[id*="keyword" i]',
      '[id*="search" i]',
    ],
    SEARCH_KEYWORD,
    'keyword search box'
  );

  // Age filters
  await tryFill(
    page,
    [
      '#txtAgeFrom',
      'input[id*="agefrom" i]',
      'input[name*="agefrom" i]',
      'input[placeholder*="age from" i]',
      'input[placeholder*="min age" i]',
    ],
    MIN_AGE,
    'min age'
  );

  await tryFill(
    page,
    [
      '#txtAgeTo',
      'input[id*="ageto" i]',
      'input[name*="ageto" i]',
      'input[placeholder*="age to" i]',
      'input[placeholder*="max age" i]',
    ],
    MAX_AGE,
    'max age'
  );

  await saveScreenshot(page, '06-form-filled');

  // Click Search button
  await tryClick(
    page,
    [
      'button:has-text("Search")',
      'input[value="Search"]',
      'a:has-text("Search")',
      '#btnSearch',
      'button[type="submit"]',
    ],
    'Search button'
  );

  // Wait for results to load
  await page.waitForTimeout(4000);
  await saveScreenshot(page, '07-search-results');
  console.log(`[step] Results page URL: ${page.url()}`);
}

async function extractAvailableSpots(page) {
  console.log('[step] Extracting available spots...');
  const spots = [];

  const pageText = await page.evaluate(() => document.body.innerText);
  console.log(
    '[debug] Page text sample:',
    pageText.substring(0, 500).replace(/\n/g, ' ')
  );

  // Strategy 1: Look for activity cards/rows containing "Pickleball" text
  try {
    const activityRows = await page
      .locator(
        [
          '.search-result-item',
          '.activity-item',
          '.an-activity',
          '.program-item',
          '[class*="activity-row"]',
          '[class*="result-item"]',
          'tr',
          '.an-list-item',
        ].join(', ')
      )
      .all();

    for (const row of activityRows) {
      const text = await row.innerText().catch(() => '');
      const lower = text.toLowerCase();

      if (!lower.includes('pickleball')) continue;

      // Check if spots are available — look for "Open", available count, or Register/Add buttons
      const hasOpenSpot =
        lower.includes('open') ||
        lower.includes('available') ||
        lower.includes('register') ||
        lower.includes('add to cart') ||
        lower.includes('enroll') ||
        /\d+\s*(spot|space|opening)/i.test(text);

      // Look for "Full", "Closed", "Waitlist" as negative signals
      const isFull =
        lower.includes('full') ||
        lower.includes('closed') ||
        lower.includes('no spots') ||
        lower.includes('sold out');

      if (hasOpenSpot && !isFull) {
        const name = text.split('\n')[0].trim().substring(0, 120);
        spots.push({ name, raw: text.substring(0, 200) });
        console.log(`[found] Available spot: ${name}`);
      }
    }
  } catch (err) {
    console.warn('[warn] Strategy 1 failed:', err.message);
  }

  // Strategy 2: Look for Register / Add to Cart links — their presence means spots open
  if (spots.length === 0) {
    try {
      const registerBtns = await page
        .locator(
          'a:has-text("Register"), button:has-text("Register"), a:has-text("Add to Cart"), button:has-text("Add to Cart"), a:has-text("Enroll")'
        )
        .all();

      for (const btn of registerBtns) {
        const btnText = await btn.innerText().catch(() => '');
        // Walk up to find parent activity name
        const parentText = await btn
          .evaluate((el) => {
            let node = el.parentElement;
            for (let i = 0; i < 5; i++) {
              if (!node) break;
              if (node.innerText && node.innerText.length > 20) {
                return node.innerText.substring(0, 200);
              }
              node = node.parentElement;
            }
            return '';
          })
          .catch(() => '');

        if (
          parentText.toLowerCase().includes('pickleball') ||
          spots.length === 0
        ) {
          spots.push({
            name: parentText.split('\n')[0].trim() || `Available (${btnText})`,
            raw: parentText.substring(0, 200),
          });
        }
      }
    } catch (err) {
      console.warn('[warn] Strategy 2 failed:', err.message);
    }
  }

  // Strategy 3: Parse the raw page text for pickleball + open/available patterns
  if (spots.length === 0 && pageText.toLowerCase().includes('pickleball')) {
    const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].toLowerCase().includes('pickleball') &&
        lines
          .slice(i, i + 5)
          .join(' ')
          .toLowerCase()
          .match(/open|available|register|enroll|\d+ spot/)
      ) {
        const nearby = lines.slice(i, i + 5).join(' ');
        if (!nearby.toLowerCase().match(/full|closed|waitlist|sold out/)) {
          spots.push({ name: lines[i], raw: nearby });
        }
      }
    }
  }

  console.log(`[step] Found ${spots.length} available pickleball spot(s).`);
  return spots;
}

export async function checkPickleballAvailability() {
  if (!USER_ID || !PASSWORD) {
    throw new Error(
      'USER_ID and PASSWORD must be set in .env file. Copy .env.example to .env and fill in your credentials.'
    );
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });

    const page = await context.newPage();

    // Suppress noisy console from the site
    page.on('console', (msg) => {
      if (msg.type() === 'error')
        console.log('[browser-error]', msg.text().substring(0, 80));
    });

    await login(page);
    await navigateToActivitySearch(page);
    await performSearch(page);
    const spots = await extractAvailableSpots(page);

    return {
      available: spots.length >= MIN_SPOTS,
      spots,
      timestamp: new Date().toISOString(),
      searchUrl: page.url(),
    };
  } finally {
    await browser.close();
  }
}
