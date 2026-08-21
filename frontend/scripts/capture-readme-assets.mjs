/**
 * Captures real UI screenshots into ../assets/ for the repo-root README.
 * Prereq: dev server running (default http://127.0.0.1:8080).
 *
 *   cd frontend && npm run dev
 *   node scripts/capture-readme-assets.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.resolve(FRONTEND_ROOT, "..", "assets");
const BASE = process.env.CAPTURE_BASE_URL || "http://127.0.0.1:8080";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(page) {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction(
    () => {
      const w = document.querySelector("#current-weight");
      return w && w.textContent && w.textContent.trim() !== "--";
    },
    { timeout: 120000 },
  );
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await delay(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(1200);
}

async function shotElement(page, id, outName, { pad = 12 } = {}) {
  const el = page.locator(`#${id}`);
  await el.scrollIntoViewIfNeeded();
  await delay(400);
  const box = await el.boundingBox();
  if (!box) {
    console.warn(`[capture] skip ${outName}: #${id} not visible`);
    return;
  }
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
  const outPath = path.join(ASSETS_DIR, outName);
  await page.screenshot({ path: outPath, clip });
  console.log("[capture]", outPath);
}

async function shotFullPage(page, outName) {
  const outPath = path.join(ASSETS_DIR, outName);
  await page.screenshot({ path: outPath, fullPage: true });
  console.log("[capture]", outPath, "(fullPage)");
}

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1480, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  try {
    await waitReady(page);

    await shotElement(page, "executive-hub-card", "executive_hub.png");
    await shotFullPage(page, "dashboard_overview.png");
    await shotElement(page, "chart-section", "chart_detail.png", { pad: 16 });

    // Weekly review (monthly report widget not mounted in current index.html)
    await shotElement(page, "weekly-review-card", "weekly_review.png");

    const corr = page.locator("#correlation-matrix-card");
    await corr.scrollIntoViewIfNeeded();
    await page.waitForFunction(
      () => {
        const c = document.querySelector("#correlation-matrix-container");
        return c && !c.querySelector(".skeleton-loader");
      },
      { timeout: 60000 },
    );
    await delay(500);
    await shotElement(page, "correlation-matrix-card", "advanced_analytics_overview.png", { pad: 16 });

    await shotElement(page, "goal-simulator-card", "goal_simulator.png");
    await shotElement(page, "macro-summary-card", "macro_breakdown.png");
    await shotElement(page, "protein-adequacy-card", "protein_adequacy.png");
    await shotElement(page, "manual-entry-widget", "quick_entry.png");
    await shotElement(page, "calorie-heatmap-card", "calorie_heatmap.png");

    // Refeed coach (lazy — scroll into view first)
    await page.locator("#refeed-recommender-card").scrollIntoViewIfNeeded();
    await delay(1200);
    await shotElement(page, "refeed-recommender-card", "refeed_coach.png", { pad: 16 });
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
