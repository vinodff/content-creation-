import fetch from "node-fetch";

async function run() {
  const handle = "zuck";
  const res = await fetch(`https://api.microlink.io/?url=https://www.instagram.com/${handle}`);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run();
