import type {
  EditorialMarketAssessment,
  PublisherOrigin,
} from "../schema/types.js";

export interface OutletEditorialProfile {
  publisherOrigin: PublisherOrigin;
  editorialMarket: Extract<EditorialMarketAssessment, { status: "observed" }>;
}

/**
 * A deliberately small, evidence-backed registry for outlets present in the
 * current live same-story slice. It is not a domain-name or headquarters
 * heuristic. Every entry names the outlet's own market documentation and
 * keeps publisher location separate from editorial market.
 */
const profiles: Readonly<Record<string, OutletEditorialProfile>> = {
  "albuquerqueexpress.com": {
    publisherOrigin: {
      countryName: "Australia",
      countryCode: "AU",
      coordinates: { latitude: -33.8688, longitude: 151.2093 },
      confidence: 0.96,
      evidenceSource: "publisher_registry",
    },
    editorialMarket: {
      status: "observed",
      value: {
        regionCode: "US-NM-ABQ",
        label: "Albuquerque metropolitan area, New Mexico",
        coordinates: { latitude: 35.0844, longitude: -106.6504 },
      },
      confidence: 0.99,
      method: "documented_outlet_market",
      evidence: [
        {
          kind: "outlet_market_documentation",
          url: "https://www.albuquerqueexpress.com/about",
          quote: "Market: City of Albuquerque/Albuquerque Metropolitan Statistical Area (MSA), New Mexico",
        },
        {
          kind: "publisher_location",
          url: "https://www.albuquerqueexpress.com/about",
          quote: "Publisher: Midwest Radio Network, Level 2, 111 Harrington Street, Sydney NSW 2000, Australia",
        },
      ],
      reason: null,
    },
  },
  "australiannews.net": {
    publisherOrigin: {
      countryName: "United Arab Emirates",
      countryCode: "AE",
      coordinates: { latitude: 25.2048, longitude: 55.2708 },
      confidence: 0.82,
      evidenceSource: "publisher_registry",
    },
    editorialMarket: {
      status: "observed",
      value: {
        regionCode: "AU",
        label: "Australia",
        coordinates: { latitude: -25.2744, longitude: 133.7751 },
      },
      confidence: 0.94,
      method: "documented_outlet_market",
      evidence: [
        {
          kind: "outlet_market_documentation",
          url: "https://www.australiannews.net/about",
          quote: "Australian News is a stand-alone site covering news of the area",
        },
        {
          kind: "publisher_location",
          url: "https://www.australiannews.net/about",
          quote: "Mainstream Media Limited, P.O Box 37911, Dubai, UAE",
        },
      ],
      reason: null,
    },
  },
};

function normalizedDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

export function resolveOutletEditorialProfile(domain: string): OutletEditorialProfile | undefined {
  const profile = profiles[normalizedDomain(domain)];
  return profile === undefined ? undefined : structuredClone(profile);
}

export function registeredEditorialMarketDomains(): string[] {
  return Object.keys(profiles).sort();
}
