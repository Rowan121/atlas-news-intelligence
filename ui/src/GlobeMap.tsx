import { useEffect, useRef, useState } from "react";
import {
  AttributionControl,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ProminenceMode, RegionDominance, StoryCluster } from "./types";

export interface CoverageHeatPoint {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  rawProminence: number;
  normalizedProminence: number;
  evidenceCount: number;
}

interface GlobeMapProps {
  clusters: StoryCluster[];
  regions: RegionDominance[];
  selectedClusterId: string | null;
  prominenceMode: ProminenceMode;
  viewMode: "overview" | "story";
  coverageHeatPoints: CoverageHeatPoint[];
  onSelectCluster: (id: string) => void;
  onSelectRegion: (id: string) => void;
}

const MAP_STYLE =
  import.meta.env.VITE_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/positron";
const COVERAGE_SOURCE = "atlas-coverage-markets";
const COVERAGE_HEAT = "atlas-coverage-heat";
const COVERAGE_POINTS = "atlas-coverage-points";

function heatCollection(points: CoverageHeatPoint[], mode: ProminenceMode) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((point) => ({
      type: "Feature" as const,
      properties: {
        id: point.id,
        label: point.label,
        evidenceCount: point.evidenceCount,
        weight: Math.max(
          0.05,
          Math.min(1, mode === "raw" ? Math.log2(point.rawProminence + 1) / 6 : point.normalizedProminence),
        ),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [point.longitude, point.latitude],
      },
    })),
  };
}

export function GlobeMap({
  clusters,
  regions,
  selectedClusterId,
  prominenceMode,
  viewMode,
  coverageHeatPoints,
  onSelectCluster,
  onSelectRegion,
}: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const regionsRef = useRef(regions);
  const viewModeRef = useRef(viewMode);
  const onSelectClusterRef = useRef(onSelectCluster);
  const onSelectRegionRef = useRef(onSelectRegion);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    regionsRef.current = regions;
    viewModeRef.current = viewMode;
    onSelectClusterRef.current = onSelectCluster;
    onSelectRegionRef.current = onSelectRegion;
  }, [onSelectCluster, onSelectRegion, regions, viewMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [8, 18],
      zoom: 1.35,
      minZoom: 0.7,
      maxZoom: 8,
      attributionControl: false,
      cooperativeGestures: true,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new AttributionControl({ compact: true }), "bottom-left");
    map.on("style.load", () => {
      map.setProjection({ type: "globe" });
      setMapReady(true);
    });
    map.on("click", (event: MapMouseEvent) => {
      if (viewModeRef.current !== "overview") return;
      const currentRegions = regionsRef.current;
      if (!currentRegions.length) return;
      const nearest = currentRegions.reduce(
        (best, region) => {
          const delta = Math.hypot(
            event.lngLat.lng - region.longitude,
            event.lngLat.lat - region.latitude,
          );
          return delta < best.delta ? { delta, region } : best;
        },
        { delta: Number.POSITIVE_INFINITY, region: currentRegions[0] },
      );
      if (nearest.delta < 24) onSelectRegionRef.current(nearest.region.id);
    });
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      setMapReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    clusters.forEach((cluster) => {
      const location = cluster.eventLocations[0];
      if (!location) return;
      const value = prominenceMode === "raw" ? cluster.rawProminence : cluster.normalizedProminence;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `map-story-marker${cluster.id === selectedClusterId ? " is-selected" : ""}${viewMode === "story" ? " is-event-anchor" : ""}`;
      button.style.setProperty("--marker-scale", String(Math.max(0.72, Math.min(1.8, 0.72 + value))));
      button.setAttribute(
        "aria-label",
        `${cluster.canonicalTitle}, event location ${location.label}, ${cluster.publisherCount} publishers`,
      );
      button.title = `${cluster.canonicalTitle} — event location: ${location.label}`;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectClusterRef.current(cluster.id);
      });
      const marker = new Marker({ element: button, anchor: "center" })
        .setLngLat([location.longitude, location.latitude])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [clusters, mapReady, prominenceMode, selectedClusterId, viewMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const data = heatCollection(viewMode === "story" ? coverageHeatPoints : [], prominenceMode);
    const existing = map.getSource(COVERAGE_SOURCE) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data);
    } else {
      map.addSource(COVERAGE_SOURCE, { type: "geojson", data });
      map.addLayer({
        id: COVERAGE_HEAT,
        type: "heatmap",
        source: COVERAGE_SOURCE,
        maxzoom: 7,
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.7, 6, 1.8],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 28, 6, 56],
          "heatmap-opacity": 0.78,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(255,255,255,0)",
            0.18,
            "rgba(255,213,128,0.35)",
            0.45,
            "rgba(255,143,72,0.62)",
            0.72,
            "rgba(222,55,53,0.78)",
            1,
            "rgba(137,15,45,0.92)",
          ],
        },
      });
      map.addLayer({
        id: COVERAGE_POINTS,
        type: "circle",
        source: COVERAGE_SOURCE,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 2, 7, 6],
          "circle-color": "#b42318",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.88,
        },
      });
    }
  }, [coverageHeatPoints, mapReady, prominenceMode, viewMode]);

  useEffect(() => {
    const cluster = clusters.find((item) => item.id === selectedClusterId);
    const location = cluster?.eventLocations[0];
    if (!location || !mapRef.current) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapRef.current.easeTo({
      center: [location.longitude, location.latitude],
      zoom: Math.max(mapRef.current.getZoom(), viewMode === "story" ? 1.8 : 2.4),
      duration: reduceMotion ? 0 : 720,
    });
  }, [clusters, selectedClusterId, viewMode]);

  return (
    <div className="globe-frame">
      <div
        ref={containerRef}
        className="globe-map"
        aria-label={
          viewMode === "story"
            ? "Interactive globe for one story. Heat shows only evidence-backed coverage markets; the outlined marker shows the event location."
            : "Interactive globe showing verified event locations. Use the story feed for a fully keyboard-accessible alternative."
        }
      />
      <div className={`map-key is-${viewMode}`} aria-hidden="true">
        {viewMode === "story" ? (
          <><span className="map-key-heat" /> Coverage-market intensity <span className="map-key-line" /><span className="map-key-anchor" /> Event location</>
        ) : (
          <><span className="map-key-dot" /> Event location <span className="map-key-line" /> Relative prominence</>
        )}
      </div>
    </div>
  );
}
