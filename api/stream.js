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

    // Fetch reporter posts
    for (const handle of rpList) {
      const url = new URL(base);
      url.searchParams.set("actor", handle);
      url.searchParams.set("limit", "50");

      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();

      for (const it of data.feed || []) {
        const post = it.post;
        const created = new Date(post.indexedAt || 0);
        if (created < since) continue;

        // Collect text: raw + facet text (handles, links, hashtags)
        const rawText = post.record?.text || "";
        const facetText = (post.record?.facets || [])
          .map(f =>
            (f.features || [])
              .map(ft => {
                if (ft?.uri) return ft.uri; // links, mentions
                if (ft?.tag) return ft.tag; // hashtags
                return "";
              })
              .join(" ")
          )
          .join(" ");
        const text = (rawText + " " + facetText).toLowerCase();

        if (kwList.some(k => text.includes(k.toLowerCase()))) {
          const rkey = post.uri.split("/").pop();
          const postUrl = `https://bsky.app/profile/${post.author.handle}/post/${rkey}`;
          all.push({ created, postUrl });
        }
      }
    }

    // Sort newest first
    all.sort((a, b) => b.created - a.created);

    // Build embed HTML
    const blocks = [];
    blocks.push('<script async src="https://embed.bsky.app/static/embed.js" charset="utf-8"></script>');
    for (const p of all) {
      blocks.push(`<blockquote class="bluesky-embed"><a href="${p.postUrl}"></a></blockquote>`);
    }

    const html =
      `<!-- Bluesky stream | keywords: ${kwList.join(" | ")} | reporters: ${rpList.join(" | ")} -->\n` +
      `<div class="bsky-stream">\n${blocks.join("\n")}\n</div>\n`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (e) {
    return res.status(500).send(`Error: ${e.message}`);
  }
}
