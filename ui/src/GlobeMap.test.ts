import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  applyLightBasemapContrast,
  createReferenceGraticule,
  installReferenceGeography,
} from "./GlobeMap";

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
