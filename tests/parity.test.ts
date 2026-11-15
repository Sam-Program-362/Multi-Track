import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The web app and the Android bundle ship separate copies of the scheduling
 * engine. They must stay byte-identical: a divergence here would mean the phone
 * and the website disagree about a prayer time.
 */
const SHARED = ["prayer", "calibration", "timezones", "calendars", "islamicEvents"];

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("web / Android parity", () => {
  for (const name of SHARED) {
    it(`src/lib/${name}.ts matches android/src/lib/${name}.ts`, () => {
      expect(read(`android/src/lib/${name}.ts`)).toBe(read(`src/lib/${name}.ts`));
    });
  }

  it("declares the same PrayerPref shape in both apps", () => {
    const extract = (source: string) => {
      const start = source.indexOf("export type PrayerPref = {");
      expect(start, "PrayerPref must exist").toBeGreaterThan(-1);
      return source.slice(start, source.indexOf("};", start) + 2);
    };
    expect(extract(read("android/src/lib/types.ts"))).toBe(extract(read("src/lib/types.ts")));
  });
});
