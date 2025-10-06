import fs from "fs";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const SITES_FILE = "./data/sites.txt";
const INDEX_FILE = "./data/index.json";
const CRAWLED_FILE = "./data/crawled.json";
const MAX_RANDOM_DISCOVERIES = 20;

async function main() {
  console.log("🕷️  Starting crawl...");

  const baseSites = await readSitesFile();
  const crawled = loadCrawledMemory();

  console.log(`🌐 Found ${baseSites.length} base sites`);
  const newIndex = [];

  for (const site of baseSites) {
    if (crawled.some((s) => s.url === site.url)) {
      console.log(`⏩ Skipped (already indexed): ${site.name}`);
      continue;
    }

    const data = await crawlSite(site.url);
    if (data) {
      newIndex.push({ ...site, ...data });
      crawled.push(site);
      console.log(`✅ Indexed: ${site.name}`);
    }
    await delay(1000);
  }

  // 🌍 Discover new random links
  const newDiscoveries = await discoverRandomSites(baseSites, MAX_RANDOM_DISCOVERIES);
  for (const newSite of newDiscoveries) {
    if (!crawled.some((s) => s.url === newSite.url)) {
      crawled.push(newSite);
      newIndex.push(newSite);
      console.log(`✨ Discovered: ${newSite.url}`);
    }
  }

  // 💾 Save everything
  fs.writeFileSync(INDEX_FILE, JSON.stringify(newIndex, null, 2));
  fs.writeFileSync(CRAWLED_FILE, JSON.stringify(crawled, null, 2));
  console.log(`✅ Done! Indexed ${newIndex.length} sites → ${INDEX_FILE}`);
}

async function readSitesFile() {
  if (!fs.existsSync(SITES_FILE)) {
    console.error(`❌ Missing ${SITES_FILE}`);
    return [];
  }

  const text = fs.readFileSync(SITES_FILE, "utf-8").trim();
  const blocks = text.split(/\n(?=Name:)/);
  const sites = [];

  for (const block of blocks) {
    const name = block.match(/Name:\s*(.+)/)?.[1]?.trim();
    const url = block.match(/URL:\s*(.+)/)?.[1]?.trim();
    const desc = block.match(/Description:\s*(.+)/)?.[1]?.trim();
    if (name && url) sites.push({ name, url, desc });
  }
  return sites;
}

function loadCrawledMemory() {
  if (fs.existsSync(CRAWLED_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CRAWLED_FILE, "utf-8"));
      console.log(`🧠 Loaded ${data.length} previously crawled sites`);
      return data;
    } catch {
      console.warn("⚠️ Could not parse crawled.json, starting fresh.");
      return [];
    }
  }
  return [];
}

async function crawlSite(url) {
  try {
    const res = await fetch(url, { timeout: 10000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const title = $("title").text().trim() || "";
    const keywords = $('meta[name="keywords"]').attr("content") || "";
    return { title, keywords };
  } catch (err) {
    console.warn(`⚠️  Skipped ${url}: ${err.message}`);
    return null;
  }
}

async function discoverRandomSites(baseSites, limit) {
  const discovered = new Set();
  const discoveredSites = [];

  for (const site of baseSites) {
    if (discoveredSites.length >= limit) break;

    try {
      const res = await fetch(site.url, { timeout: 8000 });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      $("a[href]").each((_, el) => {
        let href = $(el).attr("href");
        if (!href) return;
        if (href.startsWith("/") || href.startsWith("#")) return;
        if (!href.startsWith("http")) return;

        // Skip duplicates and obvious junk links
        if (
          href.match(/\.(jpg|png|pdf|zip|mp4|gif)$/i) ||
          href.includes("login") ||
          href.includes("signup") ||
          href.includes("discord") ||
          href.includes("utm_")
        ) return;

        if (!discovered.has(href)) {
          discovered.add(href);
          discoveredSites.push({
            name: href.replace(/^https?:\/\//, "").split("/")[0],
            url: href,
            desc: "Discovered by crawler",
          });
        }
      });
    } catch {
      continue;
    }
  }

  return discoveredSites.slice(0, limit);
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

main();
