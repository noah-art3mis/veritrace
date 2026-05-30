import { describe, it, expect } from "vitest";
import { auditDecontextualization } from "./audit";

describe("auditDecontextualization", () => {
  it("flags a proper noun the decontextualizer injected that is absent from the source", () => {
    // The "compilation album" failure mode: a specific not present in the source.
    const injected = auditDecontextualization(
      "The album was released in 2018.",
      "The Blackpink compilation album was released in 2018.",
    );
    expect(injected).toContain("Blackpink");
  });

  it("does not flag specifics that the source actually contains", () => {
    const injected = auditDecontextualization(
      "El Mencho died in Guadalajara on 22 February 2026.",
      "Nemesio 'El Mencho' Oseguera died in Guadalajara around 22 February 2026.",
    );
    // Mencho, Guadalajara, 2026 are all in the source → grounded; only the injected name surfaces.
    expect(injected).not.toContain("Guadalajara");
    expect(injected).toContain("Nemesio");
  });

  it("returns an empty array when nothing was injected (fully grounded claim)", () => {
    expect(
      auditDecontextualization("CJNG seized the airport in Jalisco.", "CJNG seized the airport in Jalisco."),
    ).toEqual([]);
  });

  it("flags an injected multi-digit number (e.g. an invented death toll)", () => {
    const injected = auditDecontextualization(
      "Several people died in the attack.",
      "About 250 people died in the attack.",
    );
    expect(injected).toContain("250");
  });

  it("ignores capitalized sentence-opener noise words", () => {
    expect(auditDecontextualization("rebels took the city.", "The rebels took the city.")).toEqual([]);
  });
});
