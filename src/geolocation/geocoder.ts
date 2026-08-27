import type { Article, EventLocation, EventLocationEvidence, LocationType } from "../schema/types.js";

export interface GazetteerPlace {
  id: string;
  name: string;
  countryCode?: string;
  admin1?: string;
  type: LocationType;
  latitude: number;
  longitude: number;
}

export interface GazetteerTextMatch {
  place: GazetteerPlace;
  start: number;
  end: number;
  matchedText: string;
  ambiguityCount: number;
}

export interface Gazetteer {
  matchText(text: string): Promise<GazetteerTextMatch[]>;
}

export interface GeocoderOptions {
  quoteContextCharacters?: number;
  minimumConfidence?: number;
}

interface LocatedMatch {
  place: GazetteerPlace;
  article: Article;
  field: "title" | "summary";
  match: GazetteerTextMatch;
  confidence: number;
  evidence: EventLocationEvidence;
}

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function matchConfidence(field: "title" | "summary", match: GazetteerTextMatch): number {
  const fieldWeight = field === "title" ? 0.74 : 0.58;
  const specificity =
    match.place.type === "city"
      ? 0.1
      : match.place.type === "admin1"
        ? 0.07
        : match.place.type === "country"
          ? 0.04
          : 0.02;
  const ambiguityPenalty = Math.min(0.28, Math.max(0, match.ambiguityCount - 1) * 0.08);
  return bounded(fieldWeight + specificity - ambiguityPenalty);
}

function quoteWindow(text: string, start: number, end: number, context: number): string {
  const from = Math.max(0, start - context);
  const to = Math.min(text.length, end + context);
  const prefix = from > 0 ? "…" : "";
  const suffix = to < text.length ? "…" : "";
  return `${prefix}${text.slice(from, to).trim()}${suffix}`;
}

function aggregateConfidence(matches: LocatedMatch[]): number {
  const strongest = Math.max(...matches.map((match) => match.confidence));
  const articles = new Set(matches.map((match) => match.article.id)).size;
  const outlets = new Set(matches.map((match) => match.article.publisher.id)).size;
  return bounded(strongest + Math.max(0, articles - 1) * 0.06 + Math.max(0, outlets - 1) * 0.04);
}

export class EvidenceBackedGeocoder {
  private readonly gazetteer: Gazetteer;
  private readonly quoteContextCharacters: number;
  private readonly minimumConfidence: number;

  constructor(gazetteer: Gazetteer, options: GeocoderOptions = {}) {
    this.gazetteer = gazetteer;
    this.quoteContextCharacters = options.quoteContextCharacters ?? 70;
    this.minimumConfidence = options.minimumConfidence ?? 0.5;
  }

  async geocode(articles: Article[]): Promise<EventLocation[]> {
    const located: LocatedMatch[] = [];
    for (const article of articles) {
      const fields: Array<{ field: "title" | "summary"; text: string }> = [
        { field: "title", text: article.title },
        ...(article.summary === undefined ? [] : [{ field: "summary" as const, text: article.summary }]),
      ];
      for (const { field, text } of fields) {
        const matches = await this.gazetteer.matchText(text);
        for (const match of matches) {
          if (
            match.start < 0 ||
            match.end <= match.start ||
            match.end > text.length ||
            text.slice(match.start, match.end).localeCompare(match.matchedText, undefined, { sensitivity: "accent" }) !== 0
          ) {
            continue;
          }
          const confidence = matchConfidence(field, match);
          if (confidence < this.minimumConfidence) continue;
          located.push({
            place: match.place,
            article,
            field,
            match,
            confidence,
            evidence: {
              articleId: article.id,
              url: article.url,
              quote: quoteWindow(text, match.start, match.end, this.quoteContextCharacters),
              start: match.start,
              end: match.end,
              method: "article_text",
            },
          });
        }
      }
    }

    const byPlace = new Map<string, LocatedMatch[]>();
    for (const match of located) {
      const existing = byPlace.get(match.place.id) ?? [];
      existing.push(match);
      byPlace.set(match.place.id, existing);
    }

    return [...byPlace.values()]
      .map((matches): EventLocation => {
        const first = matches[0]!;
        const evidenceByKey = new Map<string, EventLocationEvidence>();
        for (const match of matches) {
          const key = `${match.evidence.articleId}:${match.evidence.start ?? ""}:${match.evidence.end ?? ""}`;
          evidenceByKey.set(key, match.evidence);
        }
        return {
          id: first.place.id,
          name: first.place.name,
          ...(first.place.countryCode === undefined ? {} : { countryCode: first.place.countryCode }),
          ...(first.place.admin1 === undefined ? {} : { admin1: first.place.admin1 }),
          type: first.place.type,
          coordinates: {
            latitude: first.place.latitude,
            longitude: first.place.longitude,
          },
          confidence: aggregateConfidence(matches),
          evidence: [...evidenceByKey.values()],
        };
      })
      .sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id));
  }
}

export function eventRegionKey(location: EventLocation): string {
  return location.countryCode ?? location.admin1 ?? location.id;
}
