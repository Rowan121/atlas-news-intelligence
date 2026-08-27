import { describe, expect, it } from "vitest";
import {
  registeredEditorialMarketDomains,
  resolveOutletEditorialProfile,
} from "../src/editorial-market/registry.js";

describe("editorial-market registry", () => {
  it("resolves only documented outlet profiles and normalizes www", () => {
    expect(registeredEditorialMarketDomains()).toEqual([
      "albuquerqueexpress.com",
      "australiannews.net",
    ]);
    expect(resolveOutletEditorialProfile("WWW.ALBUQUERQUEEXPRESS.COM")?.editorialMarket).toMatchObject({
      status: "observed",
      value: { regionCode: "US-NM-ABQ", label: "Albuquerque metropolitan area, New Mexico" },
      method: "documented_outlet_market",
      confidence: 0.99,
    });
    expect(resolveOutletEditorialProfile("unverified.example")).toBeUndefined();
  });

  it("keeps publisher location distinct from primary editorial market", () => {
    const albuquerque = resolveOutletEditorialProfile("albuquerqueexpress.com")!;
    expect(albuquerque.publisherOrigin.countryCode).toBe("AU");
    expect(albuquerque.editorialMarket.value.regionCode).toBe("US-NM-ABQ");

    const australian = resolveOutletEditorialProfile("australiannews.net")!;
    expect(australian.publisherOrigin.countryCode).toBe("AE");
    expect(australian.editorialMarket.value.regionCode).toBe("AU");
  });

  it("returns defensive copies so pipeline records cannot mutate the registry", () => {
    const first = resolveOutletEditorialProfile("australiannews.net")!;
    first.editorialMarket.value.label = "Changed";
    expect(resolveOutletEditorialProfile("australiannews.net")!.editorialMarket.value.label).toBe("Australia");
  });
});
