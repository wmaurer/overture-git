import { describe, expect, it } from "@effect/vitest";

import { parseBinaryFiles } from "../../src/domain/parseBinaryFiles.ts";

describe("parseBinaryFiles", () => {
    it("identifies binary files from numstat output", () => {
        const numstat = "10\t5\tsrc/index.ts\n-\t-\timage.png\n3\t1\tREADME.md";
        const result = parseBinaryFiles(numstat);
        expect(result).toEqual(["image.png"]);
    });

    it("returns empty array when no binaries", () => {
        const numstat = "10\t5\tsrc/index.ts\n3\t1\tREADME.md";
        const result = parseBinaryFiles(numstat);
        expect(result).toEqual([]);
    });

    it("handles empty input", () => {
        const result = parseBinaryFiles("");
        expect(result).toEqual([]);
    });

    it("handles multiple binary files", () => {
        const numstat = "-\t-\ta.png\n-\t-\tb.jpg\n1\t0\tc.ts";
        const result = parseBinaryFiles(numstat);
        expect(result).toEqual(["a.png", "b.jpg"]);
    });
});
