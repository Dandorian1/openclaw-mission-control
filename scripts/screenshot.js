#!/usr/bin/env node
/**
 * screenshot.js — Headless browser screenshot utility for AI agent GUI inspection.
 *
 * Usage:
 *   node scripts/screenshot.js [page-path] [output-path] [options]
 *
 * Examples:
 *   node scripts/screenshot.js /boards /tmp/boards.png
 *   node scripts/screenshot.js /boards/69403a85-... /tmp/eng.png --width=1920 --height=1080
 *   node scripts/screenshot.js /usage /tmp/usage.png --full-page
 *   node scripts/screenshot.js / /tmp/home.png --no-auth
 *
 * Options:
 *   --width=N        Viewport width (default: 1280)
 *   --height=N       Viewport height (default: 800)
 *   --full-page      Capture full scrollable page (default: viewport only)
 *   --no-auth        Skip auth token injection
 *   --wait=N         Extra wait in ms after load (default: 2000)
 *   --base-url=URL   Base URL (default: http://localhost:3000)
 *   --selector=SEL   Wait for a CSS selector before capturing
 *
 * Environment:
 *   MC_LOCAL_AUTH_TOKEN  Override auth token (default: reads from backend/.env)
 *   MC_BASE_URL          Override base URL
 */

const { chromium } = require('playwright');
const { readFileSync } = require('fs');
const { resolve } = require('path');

async function main() {
  const args = process.argv.slice(2);
  const flags = {};
  const positional = [];

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=');
      flags[key] = val ?? true;
    } else {
      positional.push(arg);
    }
  }

  const pagePath = positional[0] || '/';
  const outputPath = positional[1] || '/tmp/mc-screenshot.png';
  const width = parseInt(flags.width || '1280', 10);
  const height = parseInt(flags.height || '800', 10);
  const fullPage = flags['full-page'] === true;
  const noAuth = flags['no-auth'] === true;
  const waitMs = parseInt(flags.wait || '2000', 10);
  const selector = flags.selector || null;

  // Resolve auth token
  let authToken = process.env.MC_LOCAL_AUTH_TOKEN;
  if (!authToken && !noAuth) {
    try {
      const envPath = resolve(__dirname, '..', 'backend', '.env');
      const envContent = readFileSync(envPath, 'utf-8');
      const match = envContent.match(/^LOCAL_AUTH_TOKEN=(.+)$/m);
      if (match) authToken = match[1].trim();
    } catch {
      // No .env found — proceed without auth
    }
  }

  const baseUrl = flags['base-url'] || process.env.MC_BASE_URL || 'http://localhost:3000';

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height } });

  try {
    // Initial navigation to set session storage
    if (authToken && !noAuth) {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.evaluate((token) => {
        sessionStorage.setItem('mc_local_auth_token', token);
      }, authToken);
    }

    // Navigate to target page
    const targetUrl = `${baseUrl}${pagePath}`;
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 15000 });

    // Wait for optional selector
    if (selector) {
      await page.waitForSelector(selector, { timeout: 10000 });
    }

    // Extra wait for dynamic content
    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }

    // Capture screenshot
    await page.screenshot({ path: outputPath, fullPage });

    // Output metadata as JSON for easy parsing by agents
    const metadata = {
      url: page.url(),
      title: await page.title(),
      screenshot: outputPath,
      viewport: { width, height },
      fullPage,
      authenticated: !!authToken && !noAuth,
    };
    console.log(JSON.stringify(metadata));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
