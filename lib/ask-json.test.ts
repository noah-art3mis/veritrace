import { describe, it, expect, vi } from "vitest";
import { askJSONWithRepair } from "./ask-json";

describe("askJSONWithRepair", () => {
  it("returns the parsed result on the first valid response, with no re-ask", async () => {
    const askText = vi.fn().mockResolvedValue('{"ok":true}');
    expect(await askJSONWithRepair(askText, "p")).toEqual({ ok: true });
    expect(askText).toHaveBeenCalledTimes(1);
  });

  it("re-asks once when the first response is unparseable, then returns the repaired JSON", async () => {
    const askText = vi
      .fn()
      .mockResolvedValueOnce("sorry, no JSON here")
      .mockResolvedValueOnce('{"ok":true}');
    expect(await askJSONWithRepair(askText, "p")).toEqual({ ok: true });
    expect(askText).toHaveBeenCalledTimes(2);
    // the repair prompt feeds the failure back and re-states the JSON-only requirement
    expect(askText.mock.calls[1][0]).toMatch(/could not be used/i);
  });

  it("re-asks once when the first response fails the validator, then returns the valid one", async () => {
    const validate = (v: unknown) => {
      if (!Array.isArray(v)) throw new Error("expected an array");
    };
    const askText = vi
      .fn()
      .mockResolvedValueOnce('{"notAnArray":1}')
      .mockResolvedValueOnce("[1,2]");
    expect(await askJSONWithRepair(askText, "p", { validate })).toEqual([1, 2]);
    expect(askText).toHaveBeenCalledTimes(2);
  });

  it("throws when the repair attempt also fails — bounded to exactly one re-ask", async () => {
    const askText = vi.fn().mockResolvedValue("never json");
    await expect(askJSONWithRepair(askText, "p")).rejects.toThrow(/Could not parse JSON/);
    expect(askText).toHaveBeenCalledTimes(2);
  });

  it("passes opts through to askText", async () => {
    const askText = vi.fn().mockResolvedValue("{}");
    await askJSONWithRepair(askText, "p", { system: "sys", maxTokens: 50 });
    expect(askText).toHaveBeenCalledWith(
      "p",
      expect.objectContaining({ system: "sys", maxTokens: 50 }),
    );
  });
});
