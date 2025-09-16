// api/stream.js
export default async function handler(req, res) {
  try {
    const { keywords = "", reporters = "", days = "7" } = req.query;

    const kwList = keywords.split(",").map(s => s.trim()).filter(Boolean);
    const rpList = reporters.split(",").map(s => s.trim()).filter(Boolean);
    if (kwList.length === 0 || rpList.length === 0) {
      return res
        .status(400)
        .send("Usage: /api/stream?keywords=Kobe Bufkin,Bufkin&reporters=mikeascotto.bsky.social&days=7");
    }

    const since = new Date(Date.now() - parseInt(days, 10) * 24 * 60 * 60 * 1000);
    const base = "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed";
    const all = [];

    // Helper: fetch posts with pagination
    async function fetchFor(handle) {
      let cursor = "";
      while (true) {
        const url = new URL(base);
        url.searchParams.set("actor", handle);
        url.searchParams.set("limit", "50");
        if (cursor) url.searchParams.set("cursor", cursor);

        const r = await fetch(url.toString());
        if (!r.ok) break;
        const data = await r.json();

        const items = data.feed || [];
        if (items.length === 0) break;

        for (const it of items) {
          const post = it.post;
          const created = new Date(post.indexedAt || 0);
          if (created < since) return; // stop if too old

          // Collect all possible text sources
          const rawText = post.record?.text || "";
          const facetText = (post.record?.facets || [])
            .map(f =>
              (f.features || [])
                .map(ft => ft?.uri || ft?.tag || "")
                .join(" ")
            )
            .join(" ");
          const authorText = post.author?.handle || "";
          const combinedText = (rawText + " " + facetText + " " + authorText).toLowerCase();

          if (kwList.some(k => combinedText.includes(k.toLowerCase()))) {
            const rkey = post.uri.split("/").pop();
            const postUrl = `https://bsky.app/profile/${post.author.handle}/post/${rkey}`;
            all.push({ created, postUrl });
          }
        }

        cursor = data.cursor;
        if (!cursor) break;
      }
    }

    // Fetch all reporters in parallel
    await Promise.all(rpList.map(fetchFor));

    // Sort newest first
    all.sort((a, b) => b.created - a.created);

    // Build embed HTML
    const blocks = [];
    blocks.push('<script async src="https://embed.bsky.app/static/embed.js" charset="utf-8"></script>');
    for (const p of all) {
      blocks.push(`<blockquote class="bluesky-embed"><a href="${p.postUrl}"></a></blockquote>`);
    }

    const html =
      `<!-- Bluesky stream | keywords: ${kwList.join(" | ")} | reporters: ${rpList.join(" | ")} | generated: ${new Date().toISOString()} -->\n` +
      `<div class="bsky-stream">\n${blocks.join("\n")}\n</div>\n`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (e) {
    return res.status(500).send(`Error: ${e.message}`);
  }
}
