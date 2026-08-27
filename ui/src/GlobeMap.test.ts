import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { applyLightBasemapContrast } from "./GlobeMap";

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
