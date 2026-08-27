import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Globe2,
  Layers3,
  LocateFixed,
  Menu,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  Signal,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AtlasApiError, createDefaultClient } from "./api";
import { GlobeMap } from "./GlobeMap";
import type {
  NewsIntelligenceClient,
  ProminenceMode,
  RegionDominance,
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
    <nav className="region-rail" aria-label="Filter by region">
      <button
        type="button"
        className={!selectedId ? "region-pill is-active" : "region-pill"}
        onClick={() => onSelect(null)}
      >
        <Globe2 size={15} /> Global
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
  selected,
  onSelect,
}: {
  cluster: StoryCluster;
  mode: ProminenceMode;
  selected: boolean;
  onSelect: () => void;
}) {
  const location = cluster.eventLocations[0];
  return (
    <button
      type="button"
      className={selected ? "story-card is-selected" : "story-card"}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
    >
      <span className="story-rank" aria-label={`Prominence ${formatProminence(cluster, mode)}`}>
        {formatProminence(cluster, mode)}
      </span>
      <span className="story-card-main">
        <span className="story-meta">
          <span><LocateFixed size={13} /> {location?.label ?? "Location unresolved"}</span>
          <span>{cluster.publisherCount} publishers</span>
          <span>{cluster.languageCount} languages</span>
        </span>
        <strong>{cluster.canonicalTitle}</strong>
        <span className="story-summary">{cluster.summary}</span>
        <span className="signal-row">
          {cluster.signals.conflict && (
            <span className="signal-badge signal-conflict"><Scale size={13} /> Conflicting claims</span>
          )}
          {cluster.signals.underreported && (
            <span className="signal-badge signal-gap"><ShieldAlert size={13} /> Coverage gap</span>
          )}
          <span className="confidence-badge">
            {Math.round(cluster.membershipConfidence * 100)}% cluster confidence
          </span>
        </span>
      </span>
      <ChevronRight className="story-arrow" size={18} aria-hidden="true" />
    </button>
  );
}

function SourceDrawer({ cluster, onClose }: { cluster: StoryCluster; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const eventLocation = cluster.eventLocations[0];
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="source-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Source comparison for ${cluster.canonicalTitle}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <span className="eyebrow">Source comparison</span>
            <h2>{cluster.canonicalTitle}</h2>
          </div>
          <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="Close source comparison">
            <X size={20} />
          </button>
        </header>

        <div className="truth-strip">
          <div><LocateFixed size={17} /><span><small>Event location</small>{eventLocation?.label ?? "Unresolved"}</span></div>
          <div><Layers3 size={17} /><span><small>Compared coverage</small>{cluster.publisherCount} publishers · {cluster.articleCount} articles</span></div>
          <div><Signal size={17} /><span><small>Cluster confidence</small>{Math.round(cluster.membershipConfidence * 100)}%</span></div>
        </div>

        {(cluster.signals.conflict || cluster.signals.underreported) && (
          <section className="analysis-note" aria-label="Coverage analysis">
            <Sparkles size={18} />
            <div>
              <strong>What differs across coverage</strong>
              {cluster.signals.conflictSummary && <p>{cluster.signals.conflictSummary}</p>}
              {cluster.signals.undercoverageSummary && <p>{cluster.signals.undercoverageSummary}</p>}
            </div>
          </section>
        )}

        <section className="source-list" aria-label="Sources">
          {cluster.sources.map((source) => (
            <article className="source-card" key={source.id}>
              <div className="source-card-head">
                <div>
                  <strong>{source.publisher}</strong>
                  <span className="publisher-origin">
                    Publisher origin: {source.publisherOrigin?.label ?? "not verified"}
                  </span>
                </div>
                <span className={`claim-position claim-${source.claimPosition}`}>{source.claimPosition}</span>
              </div>
              <h3>{source.articleTitle}</h3>
              {source.excerpt && <p>{source.excerpt}</p>}
              <footer>
                <span>{source.language.toUpperCase()} · {formatRelativeTime(source.publishedAt).replace("Updated ", "")}</span>
                <a href={source.url} target="_blank" rel="noreferrer">
                  Read original <ArrowUpRight size={14} />
                </a>
              </footer>
            </article>
          ))}
        </section>
      </aside>
    </div>
  );
}

export default function App({ client = DEFAULT_CLIENT }: AppProps) {
  const [window, setWindow] = useState<TimeWindow>("24h");
  const [prominence, setProminence] = useState<ProminenceMode>("normalized");
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [drawerClusterId, setDrawerClusterId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const { state, retry } = useSnapshot(client, window, prominence);
  const snapshot = state.data;

  const clusters = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (snapshot?.clusters ?? []).filter((cluster) => {
      if (selectedRegionId && cluster.primaryRegionId !== selectedRegionId) return false;
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
    if (clusters.length === 0) {
      setSelectedClusterId(null);
      return;
    }
    if (!clusters.some((cluster) => cluster.id === selectedClusterId)) {
      setSelectedClusterId(clusters[0].id);
    }
  }, [clusters, selectedClusterId]);

  const selectedCluster = clusters.find((cluster) => cluster.id === selectedClusterId) ?? null;
  const drawerCluster = snapshot?.clusters.find((cluster) => cluster.id === drawerClusterId) ?? null;
  const regions = snapshot?.regions ?? [];
  const health = snapshot?.health;

  const onSelectRegion = (id: string | null) => {
    setSelectedRegionId(id);
    setMobilePanelOpen(true);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Atlas home">
          <span className="brand-mark"><Globe2 size={22} /></span>
          <span><strong>ATLAS</strong><small>Global news intelligence</small></span>
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
          <button className="mobile-menu-button" type="button" onClick={() => setMobilePanelOpen((open) => !open)} aria-label="Toggle story panel">
            <Menu size={19} /> Stories
          </button>
        </div>
      </header>

      <section className="control-deck" aria-label="Intelligence controls">
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

      <main id="top" className="workspace">
        <section className="map-stage" aria-label="Geographic news map">
          <GlobeMap
            clusters={clusters}
            regions={regions}
            selectedClusterId={selectedClusterId}
            prominenceMode={prominence}
            onSelectCluster={(id) => {
              setSelectedClusterId(id);
              setMobilePanelOpen(true);
            }}
            onSelectRegion={onSelectRegion}
          />

          <div className="map-title">
            <span className="eyebrow">Live geographic signal</span>
            <h1>What is shaping attention<br />around the world?</h1>
            <p>Stories are placed where events happen—not where publishers are headquartered.</p>
          </div>

          {state.status === "loading" && !snapshot && (
            <div className="map-state-card" role="status">
              <span className="state-orbit"><Globe2 size={24} /></span>
              <div><span className="eyebrow">Opening the live graph</span><strong>Checking verified coverage…</strong></div>
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
              <div><Globe2 size={15} /><span><small>Regions</small>{snapshot.health.regionCount}</span></div>
              <div><Clock3 size={15} /><span><small>Window</small>{window}</span></div>
            </div>
          )}
        </section>

        <aside id="story-feed" className={`story-panel${mobilePanelOpen ? " is-open" : ""}`} aria-label="Dominant stories">
          <div className="story-panel-head">
            <div><span className="eyebrow">Regional pulse</span><h2>Dominant stories</h2></div>
            <span className="story-count">{clusters.length}</span>
            <button className="mobile-close" type="button" onClick={() => setMobilePanelOpen(false)} aria-label="Close story panel"><X size={18} /></button>
          </div>
          <RegionRail regions={regions} selectedId={selectedRegionId} mode={prominence} onSelect={onSelectRegion} />

          <div className="feed-label">
            <span>{prominence === "raw" ? "Coverage volume" : "Region-normalized prominence"}</span>
            <span className="metric-explainer">
              {prominence === "raw" ? "Observed article count" : "Adjusted for regional source volume"}
            </span>
          </div>

          <div className="story-list">
            {clusters.map((cluster) => (
              <StoryCard key={cluster.id} cluster={cluster} mode={prominence} selected={cluster.id === selectedClusterId} onSelect={() => setSelectedClusterId(cluster.id)} />
            ))}
            {snapshot && clusters.length === 0 && (
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

          {selectedCluster && (
            <div className="selected-story-action">
              <div><span>Selected event</span><strong>{selectedCluster.eventLocations[0]?.label ?? "Location unresolved"}</strong></div>
              <button type="button" onClick={() => setDrawerClusterId(selectedCluster.id)}>Compare {selectedCluster.publisherCount} publishers <ChevronRight size={16} /></button>
            </div>
          )}
        </aside>
      </main>

      {drawerCluster && <SourceDrawer cluster={drawerCluster} onClose={() => setDrawerClusterId(null)} />}
    </div>
  );
}
