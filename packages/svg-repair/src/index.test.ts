import { describe, expect, it } from "vitest";
import { repairSVGWithBloom } from "./index.ts";
import { ensureBrowserGlobals } from "./node.ts";

const overlappingSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120">
  <text transform="translate(60,60)" font-size="20">Alpha</text>
  <text transform="translate(70,60)" font-size="20">Beta</text>
</svg>`;

describe("repairSVGWithBloom", () => {
  it("repairs valid SVG text placement with Bloom", async () => {
    ensureBrowserGlobals();

    const result = await repairSVGWithBloom(overlappingSvg, {
      inputName: "inline.svg",
    });

    expect(result.svg).toContain("<svg");
    expect(result.report.input).toBe("inline.svg");
    expect(result.report.bloomAttempted).toBe(true);
    expect(result.report.bloomError).toBeNull();
    expect(result.report.solverUsed).toBe("bloom-direct");
    expect(result.report.bloomSteps).toBeGreaterThan(0);
    expect(result.report.overlapsBefore).toBeGreaterThan(0);
    expect(result.report.overlapsAfter).toBeLessThan(result.report.overlapsBefore);
  });

  it("rejects non-SVG XML", async () => {
    ensureBrowserGlobals();

    await expect(repairSVGWithBloom("<root />")).rejects.toThrow(/No <svg>/);
  });
});
