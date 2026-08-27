import { useEffect, useRef } from "react";
import {
  AttributionControl,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ProminenceMode, RegionDominance, StoryCluster } from "./types";

interface GlobeMapProps {
  clusters: StoryCluster[];
  regions: RegionDominance[];
  selectedClusterId: string | null;
  prominenceMode: ProminenceMode;
  onSelectCluster: (id: string) => void;
  onSelectRegion: (id: string) => void;
}

const MAP_STYLE =
  import.meta.env.VITE_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

export function GlobeMap({
  clusters,
  regions,
  selectedClusterId,
  prominenceMode,
  onSelectCluster,
  onSelectRegion,
}: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const regionsRef = useRef(regions);
  const onSelectClusterRef = useRef(onSelectCluster);
  const onSelectRegionRef = useRef(onSelectRegion);

  useEffect(() => {
    regionsRef.current = regions;
    onSelectClusterRef.current = onSelectCluster;
    onSelectRegionRef.current = onSelectRegion;
  }, [onSelectCluster, onSelectRegion, regions]);

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
    map.on("style.load", () => map.setProjection({ type: "globe" }));
    map.on("click", (event: MapMouseEvent) => {
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
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    clusters.forEach((cluster) => {
      const location = cluster.eventLocations[0];
      if (!location) return;
      const value = prominenceMode === "raw" ? cluster.rawProminence : cluster.normalizedProminence;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `map-story-marker${cluster.id === selectedClusterId ? " is-selected" : ""}`;
      button.style.setProperty("--marker-scale", String(Math.max(0.72, Math.min(1.8, 0.72 + value))));
      button.setAttribute(
        "aria-label",
        `${cluster.canonicalTitle}, event location ${location.label}, ${cluster.publisherCount} publishers`,
      );
      button.title = cluster.canonicalTitle;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectClusterRef.current(cluster.id);
      });
      const marker = new Marker({ element: button, anchor: "center" })
        .setLngLat([location.longitude, location.latitude])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [clusters, prominenceMode, selectedClusterId]);

  useEffect(() => {
    const cluster = clusters.find((item) => item.id === selectedClusterId);
    const location = cluster?.eventLocations[0];
    if (!location || !mapRef.current) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapRef.current.easeTo({
      center: [location.longitude, location.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 2.4),
      duration: reduceMotion ? 0 : 720,
    });
  }, [clusters, selectedClusterId]);

  return (
    <div className="globe-frame">
      <div
        ref={containerRef}
        className="globe-map"
        aria-label="Interactive globe showing verified event locations. Use the story feed for a fully keyboard-accessible alternative."
      />
      <div className="map-key" aria-hidden="true">
        <span className="map-key-dot" /> Event location
        <span className="map-key-line" /> Relative prominence
      </div>
    </div>
  );
}
