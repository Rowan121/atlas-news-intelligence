import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";

describe("no-JavaScript root navigation", () => {
  it("links every ordinary read surface and labels the POST-only MCP endpoint", () => {
    for (const href of [
      "/docs",
      "/api/v1/intelligence?window=24h&amp;prominence=normalized",
      "/integrations",
      "/openapi.json",
      "/.well-known/agent-card.json",
    ]) {
      expect(indexHtml).toContain(`href="${href}"`);
    }
    expect(indexHtml).not.toContain('href="/mcp"');
    expect(indexHtml).toContain("<code>POST /mcp</code>");
  });
});
