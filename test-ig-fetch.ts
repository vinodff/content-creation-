import fetch from "node-fetch";

async function run() {
  const handle = "zuck";
  const res = await fetch(`https://www.instagram.com/${handle}/`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const html = await res.text();
  console.log("Found title:", html.match(/<meta property="og:title" content="([^"]+)"/)?.[1]);
  console.log("Found image:", html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]);
  console.log("Found desc:", html.match(/<meta property="og:description" content="([^"]+)"/)?.[1]);
}

run();
