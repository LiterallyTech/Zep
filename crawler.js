// crawler.js
import fetch from "node-fetch";
import fs from "fs";
import * as cheerio from "cheerio";

const sitesTxtURL = "https://raw.githubusercontent.com/LiterallyTech/Zep/main/data/sites.txt";
const outputPath = "data/index.json";

async function crawl() {
  console.log("🕷️ Starting crawl...");
  const res = await fetch(sitesTxtURL);
  const text = await res.text();

  const blocks = text.trim().split(/\n\s*\n/);
  const entries = [];

  for (const block of blocks) {
    const entry = {};
    for (const line of block.split("\n")) {
      if (line.startsWith("Name:")) entry.name = line.replace("Name:", "").trim();
      if (line.startsWith("URL:")) entry.url = line.replace("URL:", "").trim();
      if (line.startsWith("Description:")) entry.desc = line.replace("Description:", "").trim();
    }

    if (!entry.url) continue;

    console.log(`🌐 Crawling: ${entry.url}`);
    try {
      const site = await fetch(entry.url, { timeout: 10000 });
      const html = await site.text();
      const $ = cheerio.load(html);

      const title = $("title").text().trim() || entry.name;
      const metaDesc = $('meta[name="description"]').attr("content")?.trim() || entry.desc;
      const keywords = $('meta[name="keywords"]').attr("content")?.trim() || "";

      entries.push({
        name: entry.name,
        url: entry.url,
        desc: metaDesc,
        title,
        keywords,
      });
    } catch (err) {
      console.warn("⚠️ Failed to fetch:", entry.url, "-", err.message);
      entries.push(entry);
    }
  }

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2));
  console.log(`✅ Done! Indexed ${entries.length} sites → ${outputPath}`);
}

crawl().catch(err => console.error("❌ Error during crawl:", err));
