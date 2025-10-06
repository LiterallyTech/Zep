import fs from "fs";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const SITES_FILE = "./data/sites.txt";
const INDEX_FILE = "./data/index.json";
const CRAWLED_FILE = "./data/crawled.json";
const VOTES_FILE = "./data/votes.json";
const MAX_RANDOM_DISCOVERIES = 20;

async function main() {
  console.log("🕷️  Starting crawl...");

  const baseSites = await readSitesFile();
  const crawled = loadCrawledMemory();
  const votes = loadVotes();

  console.log(`🌐 Found ${baseSites.length} base sites`);
  const newIndex = [];

  for (const site of baseSites) {
    if (crawled.some((s) => s.url === site.url)) {
      console.log(`⏩ Skipped (already indexed): ${site.name}`);
      continue;
    }

    const data = await crawlSite(site.url);
    if (data) {
      // Check if we have existing votes for this URL
      const existingVotes = votes.find(v => v.url === site.url);
      const voteScore = existingVotes ? existingVotes.score : 0;
      const positiveVotes = existingVotes ? existingVotes.positive : 0;
      const negativeVotes = existingVotes ? existingVotes.negative : 0;
      
      newIndex.push({ 
        ...site, 
        ...data, 
        voteScore,
        positiveVotes,
        negativeVotes
      });
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
      // New discoveries start with a neutral score
      newIndex.push({ 
        ...newSite, 
        voteScore: 0,
        positiveVotes: 0,
        negativeVotes: 0
      });
      console.log(`✨ Discovered: ${newSite.url}`);
    }
  }

  // 💾 Save everything
  fs.writeFileSync(INDEX_FILE, JSON.stringify(newIndex, null, 2));
  fs.writeFileSync(CRAWLED_FILE, JSON.stringify(crawled, null, 2));
  console.log(`✅ Done! Indexed ${newIndex.length} sites → ${INDEX_FILE}`);
}

function loadVotes() {
  if (fs.existsSync(VOTES_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(VOTES_FILE, "utf-8"));
    } catch {
      console.warn("⚠️ Could not parse votes.json, starting fresh.");
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
    
    // Basic metadata
    const title = $("title").text().trim() || "";
    const keywords = $('meta[name="keywords"]').attr("content") || "";
    const description = $('meta[name="description"]').attr("content") || "";
    
    // Extract main content
    let mainContent = "";
    
    // Try to find main content area
    const mainSelectors = [
      "main", 
      "article", 
      '[role="main"]',
      ".content",
      ".main-content",
      "#content",
      "#main"
    ];
    
    let contentElement = null;
    for (const selector of mainSelectors) {
      contentElement = $(selector);
      if (contentElement.length) break;
    }
    
    // If no main content area found, use body
    if (!contentElement || !contentElement.length) {
      contentElement = $("body");
    }
    
    // Extract text from headings and paragraphs
    const headings = contentElement.find("h1, h2, h3").map((_, el) => $(el).text().trim()).get();
    const paragraphs = contentElement.find("p").map((_, el) => $(el).text().trim()).get();
    
    // Combine headings and first few paragraphs
    mainContent = [...headings, ...paragraphs.slice(0, 3)].join(" ").substring(0, 500);
    
    // Extract structured data if available
    const structuredData = extractStructuredData($);
    
    // Determine page type/category
    const pageType = determinePageType($, url);
    
    return { 
      title, 
      keywords, 
      description,
      content: mainContent,
      headings,
      pageType,
      structuredData
    };
  } catch (err) {
    console.warn(`⚠️  Skipped ${url}: ${err.message}`);
    return null;
  }
}

function extractStructuredData($) {
  try {
    const scripts = $('script[type="application/ld+json"]');
    if (scripts.length) {
      return JSON.parse(scripts.first().text());
    }
  } catch (e) {
    // Ignore parsing errors
  }
  return null;
}

function determinePageType($, url) {
  // Check URL patterns first
  if (url.includes("/docs/") || url.includes("/documentation/")) return "documentation";
  if (url.includes("/blog/") || url.includes("/news/")) return "blog";
  if (url.includes("/tutorial/") || url.includes("/learn/")) return "tutorial";
  if (url.includes("/product/") || url.includes("/service/")) return "product";
  
  // Check content patterns
  const text = $("body").text().toLowerCase();
  if (text.includes("tutorial") || text.includes("how to")) return "tutorial";
  if (text.includes("documentation") || text.includes("api reference")) return "documentation";
  if (text.includes("blog") || text.includes("news")) return "blog";
  
  return "general";
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
            voteScore: 0,
            positiveVotes: 0,
            negativeVotes: 0
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