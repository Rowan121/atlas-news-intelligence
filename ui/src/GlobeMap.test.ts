import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { getWorkerUrl, type Map as MapLibreMap } from "maplibre-gl";
import {
  applyLightBasemapContrast,
  createReferenceGraticule,
  createReferenceMapStyle,
  EditorialMarketHeatLegend,
  eventMarkerAriaLabel,
  installReferenceGeography,
} from "./GlobeMap";

describe("event marker semantics", () => {
  it("describes distinct outlet editions without inflating parent-publisher count", () => {
    expect(eventMarkerAriaLabel("Relief story", "Colombia", 11)).toBe(
      "Relief story, event location Colombia, 11 outlets",
    );
  });
});

describe("editorial-market heat legend", () => {
  it("discloses each market's confidence, method, and cited evidence", () => {
    render(createElement(EditorialMarketHeatLegend, {
      points: [{
        id: "AU",
        label: "Australia",
        latitude: -25.3,
        longitude: 133.8,
        rawProminence: 3,
        normalizedProminence: 0.75,
        evidenceCount: 1,
        confidence: 0.93,
        method: "documented_outlet_market",
        evidence: [{
          kind: "outlet_market_documentation",
          url: "https://example.com/about",
          quote: "Our Australian newsroom serves a national market.",
        }],
      }],
    }));

    expect(screen.getByLabelText("Primary editorial-market heat evidence")).toBeInTheDocument();
    expect(screen.getByText("Primary editorial-market intensity")).toBeInTheDocument();
    expect(screen.getByText("93% confidence · documented outlet market · 1 record")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "outlet market documentation" })).toHaveAttribute(
      "href",
      "https://example.com/about",
    );
    expect(screen.getByText("Our Australian newsroom serves a national market.")).toBeInTheDocument();
  });
});

describe("light basemap contrast", () => {
  it("makes the default globe's land, water, and borders distinguishable", () => {
    const layers = new Map([
      ["background", { type: "background" }],
      ["water", { type: "fill" }],
      ["boundary_2", { type: "line" }],
      ["boundary_3", { type: "line" }],
      ["boundary_disputed", { type: "line" }],
    ]);
    const setPaintProperty = vi.fn();
    const map = {
      getLayer: (id: string) => layers.get(id),
      setPaintProperty,
    } as unknown as MapLibreMap;

    applyLightBasemapContrast(map);

    expect(setPaintProperty).toHaveBeenCalledWith(
      "background",
      "background-color",
      "#edf0eb",
    );
    expect(setPaintProperty).toHaveBeenCalledWith("water", "fill-color", "#b7ced8");
    expect(setPaintProperty).toHaveBeenCalledWith("boundary_2", "line-color", "#667786");
    expect(setPaintProperty).toHaveBeenCalledWith("boundary_2", "line-opacity", 0.84);
    expect(setPaintProperty).toHaveBeenCalledWith("boundary_3", "line-color", "#8796a2");
    expect(setPaintProperty).toHaveBeenCalledWith(
      "boundary_disputed",
      "line-color",
      "#765f6d",
    );
  });

  it("does not assume optional layer names or compatible layer types", () => {
    const setPaintProperty = vi.fn();
    const map = {
      getLayer: (id: string) =>
        id === "water" ? { type: "line" } : id === "background" ? { type: "background" } : undefined,
      setPaintProperty,
    } as unknown as MapLibreMap;

    applyLightBasemapContrast(map);

    expect(setPaintProperty).toHaveBeenCalledTimes(1);
    expect(setPaintProperty).toHaveBeenCalledWith(
      "background",
      "background-color",
      "#edf0eb",
    );
  });
});

describe("bundled reference geography", () => {
  it("routes production GeoJSON processing through the separately bundled worker", () => {
    expect(getWorkerUrl()).toContain("maplibre-gl-worker");
  });

  it("is present in the initial style without waiting for remote tiles or news data", () => {
    const style = createReferenceMapStyle();

    expect(style.version).toBe(8);
    expect(Object.keys(style.sources)).toEqual([
      "atlas-reference-countries",
      "atlas-reference-graticule",
    ]);
    expect(style.layers.map((layer) => layer.id)).toEqual([
      "atlas-reference-ocean",
      "atlas-reference-countries-fill",
      "atlas-reference-graticule-line",
      "atlas-reference-countries-line",
    ]);
    expect(style.layers[0]).toMatchObject({
      type: "background",
      paint: { "background-color": "#b7ced8" },
    });
    expect(style.layers.at(-1)).toMatchObject({
      type: "line",
      paint: { "line-color": "#425763", "line-opacity": 0.96 },
    });
  });

  it("provides a deterministic latitude/longitude frame", () => {
    const graticule = createReferenceGraticule();

    expect(graticule.features).toHaveLength(17);
    expect(graticule.features.every((item) => item.geometry.type === "LineString")).toBe(true);
    expect(graticule.features.some((item) =>
      item.geometry.coordinates.every((coordinate) => coordinate[1] === 0),
    )).toBe(true);
  });

  it("installs real country geometry and graticule beneath labels", () => {
    const sources = new Map<string, unknown>();
    const layers = new Map<string, { type: string }>([["water", { type: "fill" }]]);
    const addSource = vi.fn((id: string, source: unknown) => sources.set(id, source));
    const addLayer = vi.fn((layer: { id: string; type: string }) => {
      layers.set(layer.id, { type: layer.type });
    });
    const map = {
      getStyle: () => ({ layers: [{ id: "place-label", type: "symbol" }] }),
      getSource: (id: string) => sources.get(id),
      addSource,
      getLayer: (id: string) => layers.get(id),
      addLayer,
    } as unknown as MapLibreMap;

    installReferenceGeography(map);

    expect(addSource).toHaveBeenCalledTimes(2);
    const countriesCall = addSource.mock.calls.find(
      ([id]) => id === "atlas-reference-countries",
    );
    expect(countriesCall?.[1]).toMatchObject({
      type: "geojson",
      data: { type: "FeatureCollection", features: expect.any(Array) },
    });
    const countriesSource = countriesCall?.[1] as {
      data: { features: unknown[] };
    };
    expect(countriesSource.data.features.length).toBeGreaterThan(150);
    expect(addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "atlas-reference-countries-fill",
        type: "fill",
        source: "atlas-reference-countries",
      }),
      "water",
    );
    expect(addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "atlas-reference-countries-line",
        type: "line",
        source: "atlas-reference-countries",
      }),
      "place-label",
    );
    expect(addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "atlas-reference-graticule-line", type: "line" }),
      "place-label",
    );
  });
});
