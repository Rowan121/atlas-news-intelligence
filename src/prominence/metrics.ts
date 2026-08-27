import type { RegionalProminence } from "../schema/types.js";
import type { ArticleClusterDraft } from "../clustering/engine.js";
import { eventRegionKey } from "../geolocation/geocoder.js";

interface RegionCorpus {
  articleMemberships: number;
  outlets: Set<string>;
  outletArticleMemberships: Map<string, number>;
  name: string;
}

function uniqueRegionEntries(cluster: ArticleClusterDraft): Map<string, string> {
  const regions = new Map<string, string>();
  for (const location of cluster.eventLocations) {
    const key = eventRegionKey(location);
    if (!regions.has(key)) regions.set(key, location.countryCode ?? location.name);
  }
  return regions;
}

function bounded(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function computeRegionalProminence(
  clusters: ArticleClusterDraft[],
): Map<string, RegionalProminence[]> {
  const corpus = new Map<string, RegionCorpus>();
  for (const cluster of clusters) {
    for (const [regionKey, regionName] of uniqueRegionEntries(cluster)) {
      const entry = corpus.get(regionKey) ?? {
        articleMemberships: 0,
        outlets: new Set<string>(),
        outletArticleMemberships: new Map<string, number>(),
        name: regionName,
      };
      entry.articleMemberships += cluster.articles.length;
      for (const article of cluster.articles) {
        const outlet = article.publisher.id;
        entry.outlets.add(outlet);
        entry.outletArticleMemberships.set(outlet, (entry.outletArticleMemberships.get(outlet) ?? 0) + 1);
      }
      corpus.set(regionKey, entry);
    }
  }

  const result = new Map<string, RegionalProminence[]>();
  for (const cluster of clusters) {
    const outlets = new Set(cluster.articles.map((article) => article.publisher.id));
    const clusterOutletCounts = new Map<string, number>();
    for (const article of cluster.articles) {
      clusterOutletCounts.set(article.publisher.id, (clusterOutletCounts.get(article.publisher.id) ?? 0) + 1);
    }
    const entries: RegionalProminence[] = [];
    for (const [regionKey, fallbackName] of uniqueRegionEntries(cluster)) {
      const region = corpus.get(regionKey)!;
      const articleShare =
        region.articleMemberships === 0 ? 0 : cluster.articles.length / region.articleMemberships;
      const outletShare = region.outlets.size === 0 ? 0 : outlets.size / region.outlets.size;
      let perOutletShare = 0;
      for (const outlet of region.outlets) {
        const numerator = clusterOutletCounts.get(outlet) ?? 0;
        const denominator = region.outletArticleMemberships.get(outlet) ?? 0;
        perOutletShare += denominator === 0 ? 0 : numerator / denominator;
      }
      const sourceNormalizedShare = region.outlets.size === 0 ? 0 : perOutletShare / region.outlets.size;
      entries.push({
        regionKey,
        regionName: region.name || fallbackName,
        raw: {
          articleCount: cluster.articles.length,
          outletCount: outlets.size,
        },
        normalized: {
          score: bounded((articleShare + sourceNormalizedShare) / 2),
          articleShare: bounded(articleShare),
          outletShare: bounded(outletShare),
          sourceNormalizedShare: bounded(sourceNormalizedShare),
          denominators: {
            regionalArticleMemberships: region.articleMemberships,
            regionalOutlets: region.outlets.size,
          },
        },
      });
    }
    result.set(cluster.id, entries.sort((left, right) => right.normalized.score - left.normalized.score));
  }
  return result;
}
