#!/usr/bin/env node
/**
 * gui-inspect.js — Interactive GUI inspection for AI agents.
 *
 * Takes a screenshot AND extracts structured page data (text content,
 * element counts, navigation items, visible errors, etc.)
 *
 * Usage:
 *   node scripts/gui-inspect.js [page-path] [output-path]
 *
 * Output: JSON with screenshot path + page structure data
 */

const { chromium } = require('playwright');
const { readFileSync } = require('fs');
const { resolve } = require('path');

async function main() {
  const pagePath = process.argv[2] || '/';
  const outputPath = process.argv[3] || '/tmp/mc-inspect.png';

  // Resolve auth token from .env
  let authToken;
  try {
    const envPath = resolve(__dirname, '..', 'backend', '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    const match = envContent.match(/^LOCAL_AUTH_TOKEN=(.+)$/m);
    if (match) authToken = match[1].trim();
  } catch { /* no .env */ }

  const baseUrl = process.env.MC_BASE_URL || 'http://localhost:3000';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    // Auth
    if (authToken) {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.evaluate((token) => {
        sessionStorage.setItem('mc_local_auth_token', token);
      }, authToken);
    }

    // Navigate
    await page.goto(`${baseUrl}${pagePath}`, { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(2500);

    // Screenshot
    await page.screenshot({ path: outputPath, fullPage: true });

    // Extract page data
    const pageData = await page.evaluate(() => {
      const data = {};

      // Page title and headings
      data.title = document.title;
      data.h1 = [...document.querySelectorAll('h1')].map(el => el.textContent?.trim()).filter(Boolean);
      data.h2 = [...document.querySelectorAll('h2')].map(el => el.textContent?.trim()).filter(Boolean);

      // Navigation items
      data.nav = [...document.querySelectorAll('nav a, [role="navigation"] a, aside a')]
        .map(el => ({ text: el.textContent?.trim(), href: el.getAttribute('href') }))
        .filter(item => item.text);

      // Buttons
      data.buttons = [...document.querySelectorAll('button, [role="button"], a.btn, a[class*="button"]')]
        .map(el => el.textContent?.trim())
        .filter(Boolean)
        .slice(0, 30);

      // Form inputs
      data.inputs = [...document.querySelectorAll('input, textarea, select')]
        .map(el => ({
          type: el.type || el.tagName.toLowerCase(),
          name: el.name || el.getAttribute('aria-label') || el.placeholder || '',
          value: el.value || '',
        }))
        .slice(0, 20);

      // Error messages
      data.errors = [...document.querySelectorAll('[role="alert"], .error, .text-destructive, [class*="error"]')]
        .map(el => el.textContent?.trim())
        .filter(Boolean);

      // Tables
      data.tables = [...document.querySelectorAll('table')].map(table => {
        const headers = [...table.querySelectorAll('th')].map(th => th.textContent?.trim());
        const rows = [...table.querySelectorAll('tbody tr')].slice(0, 10).map(tr =>
          [...tr.querySelectorAll('td')].map(td => td.textContent?.trim())
        );
        return { headers, rowCount: table.querySelectorAll('tbody tr').length, sampleRows: rows };
      });

      // Cards / main content sections
      data.cards = [...document.querySelectorAll('[class*="card"], [class*="Card"]')]
        .slice(0, 20)
        .map(el => el.textContent?.trim().slice(0, 200));

      // Toast/notification messages
      data.toasts = [...document.querySelectorAll('[class*="toast"], [class*="Toast"], [role="status"]')]
        .map(el => el.textContent?.trim())
        .filter(Boolean);

      return data;
    });

    const result = {
      url: page.url(),
      screenshot: outputPath,
      authenticated: !!authToken,
      pageData,
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
