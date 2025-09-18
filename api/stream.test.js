import handler from "./stream.js";
import { jest } from "@jest/globals";

global.fetch = jest.fn();

describe("api/stream", () => {
  it("should handle out-of-order posts and pagination correctly", async () => {
    const now = Date.now();
    const since = new Date(now - 2 * 24 * 60 * 60 * 1000); // 2 days ago

    const post1 = {
      uri: "post1_uri",
      indexedAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      author: { handle: "test.bsky.social" },
      record: { text: "this is a post about keyword" },
    };
    const post2 = {
      uri: "post2_uri",
      indexedAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago (too old)
      author: { handle: "test.bsky.social" },
      record: { text: "this is another post about keyword" },
    };
    const post3 = {
      uri: "post3_uri",
      indexedAt: new Date(now - 1.5 * 24 * 60 * 60 * 1000).toISOString(), // 1.5 days ago
      author: { handle: "test.bsky.social" },
      record: { text: "a third post with keyword" },
    };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feed: [{ post: post1 }, { post: post2 }],
          cursor: "cursor-1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          feed: [{ post: post3 }],
          cursor: null,
        }),
      });

    const req = {
      query: {
        keywords: "keyword",
        reporters: "test.bsky.social",
        days: "2",
      },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledTimes(1);
    const html = res.send.mock.calls[0][0];

    // Check that post1 and post3 are in the output, but post2 is not.
    expect(html).toContain(`https://bsky.app/profile/test.bsky.social/post/post1_uri`);
    expect(html).not.toContain(`https://bsky.app/profile/test.bsky.social/post/post2_uri`);
    expect(html).toContain(`https://bsky.app/profile/test.bsky.social/post/post3_uri`);
  });
});
