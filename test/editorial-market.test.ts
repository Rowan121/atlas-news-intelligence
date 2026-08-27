import { describe, expect, it } from "vitest";
import {
  registeredEditorialMarketDomains,
  resolveOutletEditorialProfile,
} from "../src/editorial-market/registry.js";

describe("editorial-market registry", () => {
  it("resolves only documented outlet profiles and normalizes www", () => {
    expect(registeredEditorialMarketDomains()).toEqual(expect.arrayContaining([
      "1075theriver.iheart.com",
      "albuquerqueexpress.com",
      "australiannews.net",
      "hot1079.iheart.com",
      "q102.iheart.com",
      "wjbt.iheart.com",
    ]));
    expect(registeredEditorialMarketDomains()).toHaveLength(13);
    expect(resolveOutletEditorialProfile("WWW.ALBUQUERQUEEXPRESS.COM")?.editorialMarket).toMatchObject({
      status: "observed",
      value: { regionCode: "US-NM-ABQ", label: "Albuquerque metropolitan area, New Mexico" },
      method: "documented_outlet_market",
      confidence: 0.99,
    });
    expect(resolveOutletEditorialProfile("unverified.example")).toBeUndefined();
  });

  it("maps current station editions to distinct documented editorial markets", () => {
    const nashville = resolveOutletEditorialProfile("1075theriver.iheart.com")!;
    const philadelphia = resolveOutletEditorialProfile("q102.iheart.com")!;

    expect(nashville.editorialMarket).toMatchObject({
      status: "observed",
      value: { regionCode: "US-TN-NASHVILLE", label: "Nashville, Tennessee" },
      method: "documented_outlet_market",
    });
    expect(philadelphia.editorialMarket).toMatchObject({
      status: "observed",
      value: { regionCode: "US-PA-PHILADELPHIA", label: "Philadelphia, Pennsylvania" },
      method: "documented_outlet_market",
    });
    expect(nashville.editorialMarket.value.regionCode).not.toBe(
      philadelphia.editorialMarket.value.regionCode,
    );
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
