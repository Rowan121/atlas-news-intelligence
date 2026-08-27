import type {
  EditorialMarketAssessment,
  PublisherOrigin,
} from "../schema/types.js";

export interface OutletEditorialProfile {
  publisherOrigin: PublisherOrigin;
  editorialMarket: Extract<EditorialMarketAssessment, { status: "observed" }>;
}

interface DocumentedUsStationInput {
  domain: string;
  regionCode: string;
  label: string;
  latitude: number;
  longitude: number;
  evidenceUrl: string;
  marketQuote: string;
  publisherQuote: string;
  confidence?: number;
}

function documentedUsStation(input: DocumentedUsStationInput): [string, OutletEditorialProfile] {
  return [input.domain, {
    publisherOrigin: {
      countryName: "United States",
      countryCode: "US",
      coordinates: { latitude: input.latitude, longitude: input.longitude },
      confidence: 0.96,
      evidenceSource: "publisher_registry",
    },
    editorialMarket: {
      status: "observed",
      value: {
        regionCode: input.regionCode,
        label: input.label,
        coordinates: { latitude: input.latitude, longitude: input.longitude },
      },
      confidence: input.confidence ?? 0.97,
      method: "documented_outlet_market",
      evidence: [
        {
          kind: "outlet_market_documentation",
          url: input.evidenceUrl,
          quote: input.marketQuote,
        },
        {
          kind: "publisher_location",
          url: input.evidenceUrl,
          quote: input.publisherQuote,
        },
      ],
      reason: null,
    },
  }];
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
  ...Object.fromEntries([
    documentedUsStation({
      domain: "1075theriver.iheart.com",
      regionCode: "US-TN-NASHVILLE",
      label: "Nashville, Tennessee",
      latitude: 36.1627,
      longitude: -86.7816,
      evidenceUrl: "https://1075theriver.iheart.com/",
      marketQuote: "Nashville: Live Life. Love Music.",
      publisherQuote: "1075 The River 1200 Broadway 6th Floor Nashville, TN 37203",
    }),
    documentedUsStation({
      domain: "993thebeat.iheart.com",
      regionCode: "US-FL-PANAMA-CITY",
      label: "Panama City and the Florida Gulf Coast",
      latitude: 30.1588,
      longitude: -85.6602,
      evidenceUrl: "https://993thebeat.iheart.com/contact/",
      marketQuote: "Panama City's Throwback Hip Hop and R&B radio station",
      publisherQuote: "99.3 The Beat 490 Grace Ave Panama City, FL 32401",
    }),
    documentedUsStation({
      domain: "hot1079.iheart.com",
      regionCode: "US-NY-SYRACUSE",
      label: "Syracuse, New York",
      latitude: 43.0481,
      longitude: -76.1474,
      evidenceUrl: "https://hot1079.iheart.com/contact/",
      marketQuote: "HOT 107.9 plays All the Hits for Syracuse, Oswego, Liverpool, Cicero, East Syracuse, Baldwinsville and more!",
      publisherQuote: "HOT 107.9 500 Plum Street Syracuse, NY 13204-0000",
    }),
    documentedUsStation({
      domain: "kiss959fm.iheart.com",
      regionCode: "US-DELMARVA",
      label: "Delmarva",
      latitude: 38.3607,
      longitude: -75.5994,
      evidenceUrl: "https://kiss959fm.iheart.com/",
      marketQuote: "KISS 95.9 is Delmarva's #1 Hit Music Station that reaches the beaches",
      publisherQuote: "KISS 95.9 351 Tilghman Ave Salisbury, MD 21804",
    }),
    documentedUsStation({
      domain: "kissfmrgv.iheart.com",
      regionCode: "US-TX-RGV",
      label: "Rio Grande Valley, Texas",
      latitude: 26.2034,
      longitude: -98.23,
      evidenceUrl: "https://kissfmrgv.iheart.com/",
      marketQuote: "All The Hits for the Rio Grande Valley",
      publisherQuote: "105.5 & 106.3 KISS FM 901 E. Pike Blvd. Weslaco, TX 78596",
    }),
    documentedUsStation({
      domain: "kisswheeling.iheart.com",
      regionCode: "US-OHIO-VALLEY-WHEELING",
      label: "Ohio Valley around Wheeling",
      latitude: 40.064,
      longitude: -80.7201,
      evidenceUrl: "https://kisswheeling.iheart.com/contact/",
      marketQuote: "Ohio Valley Discount Deals and OV Events Calendar",
      publisherQuote: "KISS 95.7 1015 Main Street Wheeling, WV 26003",
      confidence: 0.93,
    }),
    documentedUsStation({
      domain: "q102.iheart.com",
      regionCode: "US-PA-PHILADELPHIA",
      label: "Philadelphia, Pennsylvania",
      latitude: 39.9526,
      longitude: -75.1652,
      evidenceUrl: "https://q102.iheart.com/contact/",
      marketQuote: "Q102 is Philly's #1 Hit Music Station",
      publisherQuote: "Q102 2 Bala Plaza Suite PL50 Bala Cynwyd, PA 19004",
    }),
    documentedUsStation({
      domain: "radiosunny.iheart.com",
      regionCode: "US-NY-CANANDAIGUA",
      label: "Canandaigua, New York",
      latitude: 42.8742,
      longitude: -77.288,
      evidenceUrl: "https://radiosunny.iheart.com/contact/",
      marketQuote: "Canandaigua's Variety Station",
      publisherQuote: "Sunny 102.3 100 Chestnut Street Rochester, NY 14604",
      confidence: 0.94,
    }),
    documentedUsStation({
      domain: "throwback963.iheart.com",
      regionCode: "US-LA-NEW-ORLEANS",
      label: "New Orleans, Louisiana",
      latitude: 29.9511,
      longitude: -90.0715,
      evidenceUrl: "https://throwback963.iheart.com/contact/",
      marketQuote: "New Orleans' Throwbacks and R&B",
      publisherQuote: "Throwback 96.3 929 Howard Ave. New Orleans, LA 70113",
    }),
    documentedUsStation({
      domain: "wjbt.iheart.com",
      regionCode: "US-FL-JACKSONVILLE",
      label: "Jacksonville, Florida",
      latitude: 30.3322,
      longitude: -81.6557,
      evidenceUrl: "https://wjbt.iheart.com/contact/",
      marketQuote: "Jacksonville's Hip Hop and R&B Flava!",
      publisherQuote: "93.3 The Beat 8000 Belfort Pkwy Jacksonville, FL 32256",
    }),
    documentedUsStation({
      domain: "wyht.iheart.com",
      regionCode: "US-OH-MID-OHIO",
      label: "Mid-Ohio around Mansfield",
      latitude: 40.7584,
      longitude: -82.5154,
      evidenceUrl: "https://wyht.iheart.com/contact/",
      marketQuote: "wyht, Mid-Ohio's Y105, radio",
      publisherQuote: "Y105 1400 Radio Lane Mansfield, OH 44906",
    }),
  ]),
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
