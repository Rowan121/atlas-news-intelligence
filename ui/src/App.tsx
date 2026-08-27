import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Globe2,
  LocateFixed,
  Menu,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  Signal,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AtlasApiError, createDefaultClient } from "./api";
import { GlobeMap, type CoverageHeatPoint } from "./GlobeMap";
import type {
  NewsIntelligenceClient,
  ProminenceMode,
  RegionDominance,
  SourceCoverage,
  StoryCluster,
  TimeWindow,
} from "./types";
import { useSnapshot } from "./useSnapshot";

interface AppProps {
  client?: NewsIntelligenceClient;
}

const WINDOW_OPTIONS: Array<{ value: TimeWindow; label: string }> = [
  { value: "6h", label: "6 hours" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
];

const DEFAULT_CLIENT = createDefaultClient();
const COMPACT_LAYOUT_QUERY = "(max-width: 760px)";

function compactLayoutMatches() {
  return typeof globalThis.window !== "undefined"
    && typeof globalThis.window.matchMedia === "function"
    && globalThis.window.matchMedia(COMPACT_LAYOUT_QUERY).matches;
}

function formatRelativeTime(timestamp: string | null) {
  if (!timestamp) return "No successful sync";
  const deltaMinutes = Math.round((Date.now() - new Date(timestamp).getTime()) / 60_000);
  if (deltaMinutes < 1) return "Updated just now";
  if (deltaMinutes < 60) return `Updated ${deltaMinutes}m ago`;
  return `Updated ${Math.round(deltaMinutes / 60)}h ago`;
}

function formatProminence(cluster: StoryCluster, mode: ProminenceMode) {
  if (mode === "raw") return cluster.rawProminence.toLocaleString();
  return `${Math.round(cluster.normalizedProminence * 100)}%`;
}

function statusMessage(error: Error) {
  if (error instanceof AtlasApiError && error.kind === "unavailable") {
    return {
      eyebrow: "Live connection pending",
      title: "The intelligence pipeline is not connected yet.",
      detail:
        "Atlas is ready for the versioned live endpoint. No placeholder stories are being shown while ingestion comes online.",
    };
  }
  if (error instanceof AtlasApiError && error.kind === "invalid-response") {
    return {
      eyebrow: "Contract mismatch",
      title: "The latest response failed validation.",
      detail:
        "Atlas withheld the payload because it could not verify the event, source, or health fields required by the interface.",
    };
  }
  return {
    eyebrow: "Live data interrupted",
    title: "Atlas could not refresh this view.",
    detail: error.message,
  };
}

function publisherColor(publisher: string) {
  let hash = 0;
  for (const character of publisher) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const palette = ["#2457d6", "#b42318", "#126b55", "#7a3db8", "#9a5b13", "#176b87", "#a72c62"];
  return palette[hash % palette.length];
}

function publisherInitials(publisher: string) {
  const normalized = publisher.replace(/^www\./, "").split(".")[0] ?? publisher;
  return normalized.slice(0, 2).toLocaleUpperCase();
}

function humanizeAssessmentValue(value: string) {
  return value.replaceAll("_", " ");
}

function RegionRail({
  regions,
  selectedId,
  mode,
  onSelect,
}: {
  regions: RegionDominance[];
  selectedId: string | null;
  mode: ProminenceMode;
  onSelect: (id: string | null) => void;
}) {
  return (
    <nav className="region-rail" aria-label="Filter stories by event place">
      <button
        type="button"
        className={!selectedId ? "region-pill is-active" : "region-pill"}
        onClick={() => onSelect(null)}
        aria-pressed={!selectedId}
      >
        <Globe2 size={14} /> Everywhere
      </button>
      {regions.map((region) => (
        <button
          type="button"
          className={selectedId === region.id ? "region-pill is-active" : "region-pill"}
          key={region.id}
          onClick={() => onSelect(region.id)}
          aria-pressed={selectedId === region.id}
        >
          {region.label}
          <span>
            {mode === "raw"
              ? region.rawProminence.toLocaleString()
              : `${Math.round(region.normalizedProminence * 100)}%`}
          </span>
        </button>
      ))}
    </nav>
  );
}

function StoryCard({
  cluster,
  mode,
  activeRegionId,
  onSelect,
}: {
  cluster: StoryCluster;
  mode: ProminenceMode;
  activeRegionId: string | null;
  onSelect: () => void;
}) {
  const location = cluster.eventLocations.find((candidate) => candidate.regionId === activeRegionId)
    ?? cluster.eventLocations.find((candidate) => candidate.isPrimary)
    ?? cluster.eventLocations[0];
  return (
    <button type="button" className="story-card" onClick={onSelect}>
      <span className="story-rank" aria-label={`Prominence ${formatProminence(cluster, mode)}`}>
        {formatProminence(cluster, mode)}
      </span>
      <span className="story-card-main">
        <span className="story-meta">
          <span><LocateFixed size={13} /> Event: {location?.label ?? "Location unresolved"}</span>
          <span>{cluster.publisherCount} outlets</span>
        </span>
        <strong>{cluster.canonicalTitle}</strong>
        {cluster.summary && <span className="story-summary">{cluster.summary}</span>}
        <span className="signal-row">
          {cluster.signals.conflict.status === "detected" && (
            <span className="signal-badge signal-conflict"><Scale size={13} /> Claims differ</span>
          )}
          {cluster.signals.omission.status === "detected" && (
            <span className="signal-badge signal-gap"><ShieldAlert size={13} /> Coverage gap</span>
          )}
          <span className="confidence-badge">
            {Math.round(cluster.membershipConfidence * 100)}% same-story confidence
          </span>
        </span>
      </span>
      <span className="story-open-label">Compare</span>
    </button>
  );
}

function ToneBar({ source }: { source: SourceCoverage }) {
  const value = source.tone.status === "observed" ? source.tone.value : "unknown";
  const positions = { negative: 8, mixed: 50, neutral: 50, unclear: 50, positive: 92, unknown: 50 } as const;
  const label = source.tone.status === "observed"
    ? `${source.tone.value.replace("_", " ")} · ${Math.round(source.tone.confidence * 100)}% confidence`
    : "Tone not assessed";
  return (
    <div className="tone-block" aria-label={`Coverage tone for ${source.publisherDomain}: ${label}`}>
      <div className="tone-label-row">
        <span>Critical / negative</span>
        <strong>{label}</strong>
        <span>Supportive / positive</span>
      </div>
      <div className={`tone-track${source.tone.status === "observed" ? "" : " is-unknown"}`}>
        <span className="tone-marker" style={{ left: `${positions[value]}%` }} />
      </div>
      {source.tone.status === "observed" && <small className="assessment-method">Method: {source.tone.method.replaceAll("_", " ")}</small>}
    </div>
  );
}

function SourceVariantCard({ source }: { source: SourceCoverage }) {
  const brand = publisherColor(source.publisherDomain);
  const cardStyle = { "--publisher-color": brand } as CSSProperties;
  const publisherOrigin = source.publisherOrigin.status === "observed"
    ? source.publisherOrigin.value.label
    : "Not verified";
  const editorialMarket = source.editorialMarket.status === "observed"
    ? source.editorialMarket.value.label
    : "Not evidenced in this record";
  const framing = source.framing.status === "observed"
    ? `${humanizeAssessmentValue(source.framing.value)} · ${Math.round(source.framing.confidence * 100)}% confidence`
    : "Not assessed";
  return (
    <article className="source-variant-card" style={cardStyle}>
      <header className="source-identity">
        <span className="publisher-mark" aria-hidden="true">{publisherInitials(source.publisherDomain)}</span>
        <span>
          <strong>{source.publisherDomain}</strong>
          <small>
            {source.publisher !== source.publisherDomain && `Publisher/network: ${source.publisher} · `}
            Publisher origin: {publisherOrigin}
          </small>
        </span>
        <span className="source-language">{source.language.toLocaleUpperCase()}</span>
      </header>
      <h3>{source.articleTitle}</h3>
      {source.excerpt && <p className="source-excerpt">{source.excerpt}</p>}
      <dl className="geography-facts">
        <div className="editorial-market-fact">
          <dt>Primary editorial market</dt>
          <dd>
            <strong>{editorialMarket}</strong>
            {source.editorialMarket.status === "observed" && (
              <small>
                {Math.round(source.editorialMarket.confidence * 100)}% confidence · {humanizeAssessmentValue(source.editorialMarket.method)}
              </small>
            )}
          </dd>
        </div>
        <div><dt>Framing</dt><dd>{framing}</dd></div>
      </dl>
      {source.editorialMarket.status === "observed" && (
        <div className="editorial-market-proof" aria-label={`Primary editorial market evidence for ${source.publisherDomain}`}>
          <strong>Editorial-market evidence</strong>
          <ul>
            {source.editorialMarket.evidence.map((evidence, index) => (
              <li key={`${evidence.url}-${evidence.articleId ?? index}`}>
                <a href={evidence.url} target="_blank" rel="noreferrer">
                  {humanizeAssessmentValue(evidence.kind)} <ArrowUpRight size={12} />
                </a>
                <q>{evidence.quote}</q>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ToneBar source={source} />
      <footer>
        <span>{formatRelativeTime(source.publishedAt).replace("Updated ", "")}</span>
        <a href={source.url} target="_blank" rel="noreferrer">
          Read original <ArrowUpRight size={14} />
        </a>
      </footer>
    </article>
  );
}

function FocusedStory({ cluster }: { cluster: StoryCluster }) {
  const location = cluster.eventLocations.find((candidate) => candidate.isPrimary) ?? cluster.eventLocations[0];
  const additionalLocationCount = Math.max(0, cluster.eventLocations.length - 1);
  return (
    <article className="focused-story-card" aria-label="Selected story">
      <span className="mode-chip">Selected same-story cluster</span>
      <h1>{cluster.canonicalTitle}</h1>
      {cluster.summary && <p>{cluster.summary}</p>}
      <div className="focused-story-facts">
        <span>
          <LocateFixed size={15} />
          <small>Event geography</small>
          <strong>
            {location?.label ?? "Unresolved"}
            {additionalLocationCount > 0 ? ` + ${additionalLocationCount} cited ${additionalLocationCount === 1 ? "location" : "locations"}` : ""}
          </strong>
        </span>
        <span><Signal size={15} /><small>Compared coverage</small><strong>{cluster.publisherCount} outlets · {cluster.articleCount} articles</strong></span>
        <span><CheckCircle2 size={15} /><small>Same-story confidence</small><strong>{Math.round(cluster.membershipConfidence * 100)}%</strong></span>
      </div>
      <p className="truth-caption">
        Verified event locations: {cluster.eventLocations.map((candidate) => candidate.label).join("; ")}. Heat appears only from sources with an evidenced primary editorial market; it never represents reader location or event geography by assumption.
      </p>
      {(cluster.signals.conflict.status === "detected" || cluster.signals.omission.status === "detected") && (
        <div className="focused-signal-summary">
          {cluster.signals.conflict.status === "detected" && <span>{cluster.signals.conflict.summary}</span>}
          {cluster.signals.omission.status === "detected" && <span>{cluster.signals.omission.summary}</span>}
        </div>
      )}
    </article>
  );
}

export default function App({ client = DEFAULT_CLIENT }: AppProps) {
  const [window, setWindow] = useState<TimeWindow>("24h");
  const [prominence, setProminence] = useState<ProminenceMode>("normalized");
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [focusedClusterId, setFocusedClusterId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(compactLayoutMatches);
  const comparisonHeadingRef = useRef<HTMLHeadingElement>(null);
  const overviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const storyListRef = useRef<HTMLDivElement>(null);
  const mobilePanelTriggerRef = useRef<HTMLButtonElement>(null);
  const { state, retry } = useSnapshot(client, window, prominence);
  const snapshot = state.data;

  const clusters = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (snapshot?.clusters ?? []).filter((cluster) => {
      if (
        selectedRegionId &&
        !cluster.eventLocations.some((location) => location.regionId === selectedRegionId)
      ) return false;
      if (!normalizedQuery) return true;
      return [
        cluster.canonicalTitle,
        cluster.summary,
        ...cluster.eventLocations.map((location) => location.label),
        ...cluster.sources.map((source) => source.publisher),
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [query, selectedRegionId, snapshot?.clusters]);

  useEffect(() => {
    if (focusedClusterId && !snapshot?.clusters.some((cluster) => cluster.id === focusedClusterId)) {
      setFocusedClusterId(null);
    }
  }, [focusedClusterId, snapshot?.clusters]);

  const focusedCluster = snapshot?.clusters.find((cluster) => cluster.id === focusedClusterId) ?? null;
  const viewMode = focusedCluster ? "story" : "overview";
  const regions = snapshot?.regions ?? [];
  const health = snapshot?.health;
  const mobilePanelHidden = isCompactLayout && !mobilePanelOpen;

  useEffect(() => {
    if (typeof globalThis.window === "undefined" || typeof globalThis.window.matchMedia !== "function") return;
    const media = globalThis.window.matchMedia(COMPACT_LAYOUT_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsCompactLayout(event.matches);
    setIsCompactLayout(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    // The overview and comparison views reuse this scroll container. Reset it
    // at each mode transition so a story selected low in the overview cannot
    // open with its first source card already clipped out of view.
    if (storyListRef.current) storyListRef.current.scrollTop = 0;
  }, [focusedClusterId]);

  // Only a coverageHeat market backed by a matching observed source editorial
  // market can populate this layer. Publisher origin and event location are
  // deliberately not fallbacks.
  const coverageHeatPoints: CoverageHeatPoint[] = useMemo(() => {
    if (focusedCluster?.coverageHeat.status !== "observed") return [];
    return focusedCluster.coverageHeat.markets.flatMap((market) => {
      if (market.coordinates === null) return [];
      const hasMatchingSourceMarket = focusedCluster.sources.some((source) => {
        if (source.editorialMarket.status !== "observed") return false;
        const coordinates = source.editorialMarket.value.coordinates;
        return source.editorialMarket.value.regionCode === market.regionCode
          && coordinates !== undefined
          && coordinates.latitude === market.coordinates?.latitude
          && coordinates.longitude === market.coordinates?.longitude;
      });
      if (!hasMatchingSourceMarket) return [];
      return [{
        id: market.regionCode,
        label: market.label,
        latitude: market.coordinates.latitude,
        longitude: market.coordinates.longitude,
        rawProminence: market.rawArticleCount,
        normalizedProminence: market.sourceNormalizedShare,
        evidenceCount: market.coordinates.evidence.length,
        confidence: market.coordinates.confidence,
        method: market.coordinates.method,
        evidence: market.coordinates.evidence,
      }];
    });
  }, [focusedCluster]);

  const onSelectRegion = (id: string | null) => {
    setSelectedRegionId(id);
    setMobilePanelOpen(true);
  };

  const enterStoryMode = (id: string) => {
    setFocusedClusterId(id);
    setMobilePanelOpen(true);
    requestAnimationFrame(() => comparisonHeadingRef.current?.focus());
  };

  const leaveStoryMode = () => {
    setFocusedClusterId(null);
    requestAnimationFrame(() => overviewHeadingRef.current?.focus());
  };

  const closeMobilePanel = () => {
    setMobilePanelOpen(false);
    requestAnimationFrame(() => mobilePanelTriggerRef.current?.focus());
  };

  const toggleMobilePanel = () => {
    if (mobilePanelOpen) {
      closeMobilePanel();
      return;
    }
    setMobilePanelOpen(true);
    requestAnimationFrame(() => (
      focusedCluster ? comparisonHeadingRef.current : overviewHeadingRef.current
    )?.focus());
  };

  return (
    <div className={`app-shell mode-${viewMode}`}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Atlas home" onClick={leaveStoryMode}>
          <span className="brand-mark"><Globe2 size={20} /></span>
          <span><strong>ATLAS</strong><small>Compare how the world covers one story</small></span>
        </a>
        <div className="topbar-center">
          <span className={`health-indicator health-${health?.status ?? "connecting"}`}>
            <span className="health-dot" /> {health?.status ?? "connecting"}
          </span>
          <span className="sync-time">
            {state.status === "loading" && !snapshot
              ? "Connecting to live coverage"
              : formatRelativeTime(health?.lastSuccessfulIngestionAt ?? null)}
          </span>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={retry} aria-label="Refresh live intelligence">
            <RefreshCw className={state.status === "loading" ? "is-spinning" : ""} size={18} />
          </button>
          <button
            ref={mobilePanelTriggerRef}
            className="mobile-menu-button"
            type="button"
            onClick={toggleMobilePanel}
            aria-label="Toggle story panel"
            aria-controls="story-feed"
            aria-expanded={mobilePanelOpen}
          >
            <Menu size={19} /> {viewMode === "story" ? "Coverage" : "Stories"}
          </button>
        </div>
      </header>

      <section className="control-deck" aria-label="Intelligence controls">
        <div className="view-status">
          <span className={`view-status-dot is-${viewMode}`} />
          {viewMode === "story" ? "Comparing one story" : "Exploring events"}
        </div>
        <div className="time-control segmented-control" aria-label="Time window">
          {WINDOW_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              className={window === option.value ? "is-active" : ""}
              onClick={() => setWindow(option.value)}
              aria-pressed={window === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="control-divider" />
        <div className="metric-control">
          <span><SlidersHorizontal size={15} /> Prominence</span>
          <div className="segmented-control compact">
            <button type="button" className={prominence === "raw" ? "is-active" : ""} onClick={() => setProminence("raw")} aria-pressed={prominence === "raw"}>Raw</button>
            <button type="button" className={prominence === "normalized" ? "is-active" : ""} onClick={() => setProminence("normalized")} aria-pressed={prominence === "normalized"}>Normalized</button>
          </div>
        </div>
        <div className="search-control">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search stories, places, or publishers" placeholder="Search stories, places, publishers…" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}
        </div>
      </section>

      <main id="top" className="workspace" tabIndex={-1}>
        <section className="map-stage" aria-label={viewMode === "story" ? "Selected story coverage map" : "Geographic news map"}>
          <GlobeMap
            clusters={viewMode === "story" && focusedCluster ? [focusedCluster] : clusters}
            regions={regions}
            selectedClusterId={focusedClusterId}
            prominenceMode={prominence}
            viewMode={viewMode}
            coverageHeatPoints={coverageHeatPoints}
            onSelectCluster={enterStoryMode}
            onSelectRegion={onSelectRegion}
          />

          {focusedCluster ? (
            <FocusedStory cluster={focusedCluster} />
          ) : (
            <div className="map-title">
              <span className="eyebrow">Global event view</span>
              <h1>Choose a place.<br />Then compare one story.</h1>
              <p>Start with where an event happened. Select a story to reveal every matched version, primary editorial-market evidence, and framing differences.</p>
            </div>
          )}

          {focusedCluster && coverageHeatPoints.length === 0 && (
            <div className="coverage-unavailable-note" role="note">
              <ShieldAlert size={16} />
              <span><strong>Editorial-market heat withheld</strong> {focusedCluster.coverageHeat.reason ?? "No observed primary editorial-market coordinates are attached to this cluster yet."}</span>
            </div>
          )}

          {state.status === "loading" && !snapshot && (
            <div className="map-state-card" role="status">
              <span className="state-orbit"><Globe2 size={24} /></span>
              <div><span className="eyebrow">Opening the live graph</span><strong>Checking verified same-story coverage…</strong></div>
            </div>
          )}

          {state.status === "error" && !snapshot && (() => {
            const message = statusMessage(state.error);
            return (
              <div className="map-state-card is-warning" role="alert">
                <span className="state-orbit"><AlertTriangle size={23} /></span>
                <div><span className="eyebrow">{message.eyebrow}</span><strong>{message.title}</strong><p>{message.detail}</p><button type="button" onClick={retry}>Try live endpoint again</button></div>
              </div>
            );
          })()}

          {state.status === "empty" && (
            <div className="map-state-card" role="status">
              <span className="state-orbit"><CheckCircle2 size={23} /></span>
              <div><span className="eyebrow">Live response verified</span><strong>No eligible clusters in this window.</strong><p>Try a wider time range. Atlas will not fill the map with sample stories.</p></div>
            </div>
          )}

          {snapshot && (
            <div className="health-deck" aria-label="Pipeline health">
              <div><Activity size={15} /><span><small>Pipeline</small>{snapshot.health.status}</span></div>
              <div><Signal size={15} /><span><small>Sources</small>{snapshot.health.activeSourceCount}</span></div>
              <div><Globe2 size={15} /><span><small>Event places</small>{snapshot.health.regionCount}</span></div>
              <div><Clock3 size={15} /><span><small>Window</small>{window}</span></div>
            </div>
          )}
        </section>

        <aside
          id="story-feed"
          className={`story-panel${mobilePanelOpen ? " is-open" : ""}`}
          aria-label={viewMode === "story" ? "Same-story coverage" : "Stories by event place"}
          aria-hidden={mobilePanelHidden || undefined}
          inert={mobilePanelHidden}
        >
          <div className="story-panel-head">
            <div>
              <span className="eyebrow">{viewMode === "story" ? "Cross-regional comparison" : "Stories by event place"}</span>
              {focusedCluster ? (
                <h2 ref={comparisonHeadingRef} tabIndex={-1}>News stories like “{focusedCluster.canonicalTitle}”</h2>
              ) : (
                <h2 ref={overviewHeadingRef} tabIndex={-1}>What happened where</h2>
              )}
            </div>
            {focusedCluster ? (
              <button className="back-button" type="button" onClick={leaveStoryMode}><ArrowLeft size={15} /> Back</button>
            ) : (
              <span className="story-count">{clusters.length}</span>
            )}
            <button className="mobile-close" type="button" onClick={closeMobilePanel} aria-label="Close story panel"><X size={18} /></button>
          </div>

          {!focusedCluster && (
            <RegionRail regions={regions} selectedId={selectedRegionId} mode={prominence} onSelect={onSelectRegion} />
          )}

          <div className="feed-label">
            {focusedCluster ? (
              <>
                <span>{focusedCluster.sources.length} matched versions</span>
                <span className="metric-explainer">Same event · different editorial markets and framing</span>
              </>
            ) : (
              <>
                <span>{prominence === "raw" ? "Observed coverage volume" : "Event-region prominence"}</span>
                <span className="metric-explainer">
                  {prominence === "raw" ? "Article count" : "Normalized by regional source volume"}
                </span>
              </>
            )}
          </div>

          <div ref={storyListRef} className={`story-list${focusedCluster ? " is-comparison" : ""}`}>
            {focusedCluster
              ? focusedCluster.sources.map((source) => <SourceVariantCard key={source.id} source={source} />)
              : clusters.map((cluster) => (
                  <StoryCard
                    key={cluster.id}
                    cluster={cluster}
                    mode={prominence}
                    activeRegionId={selectedRegionId}
                    onSelect={() => enterStoryMode(cluster.id)}
                  />
                ))}
            {snapshot && !focusedCluster && clusters.length === 0 && (
              <div className="feed-empty">
                <Search size={20} />
                <strong>No matching verified coverage</strong>
                <p>Clear the filters or widen the time range.</p>
              </div>
            )}
            {!snapshot && (
              <div className="feed-skeleton" aria-hidden="true">
                {[0, 1, 2].map((item) => <span key={item} />)}
              </div>
            )}
          </div>

          {focusedCluster && (
            <div className="comparison-footnote">
              <strong>What the map means</strong>
              <span>Heat = evidenced primary editorial market. Publisher origin and event geography stay separate and never fill the heatmap.</span>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
