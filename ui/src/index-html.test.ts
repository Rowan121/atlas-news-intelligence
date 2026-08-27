import { describe, expect, it } from "vitest";
import indexHtml from "../index.html?raw";

describe("no-JavaScript root navigation", () => {
  it("keeps the skip link on the always-visible main workspace", () => {
    expect(indexHtml).toContain('<a class="skip-link" href="#top">Skip to main content</a>');
    expect(indexHtml).toContain('<main id="top"');
    expect(indexHtml).not.toContain('class="skip-link" href="#story-feed"');
  });

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
