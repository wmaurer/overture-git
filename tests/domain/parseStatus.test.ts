import { describe, expect, it } from "@effect/vitest";

import { parseStatus } from "../../src/domain/parseStatus.ts";

describe("parseStatus", () => {
    it("parses modified files", () => {
        const status = " M src/index.ts\n M src/utils.ts";
        const result = parseStatus(status);
        expect(result).toEqual(["src/index.ts", "src/utils.ts"]);
    });

    it("parses untracked files", () => {
        const status = "?? newfile.ts\n?? another.ts";
        const result = parseStatus(status);
        expect(result).toEqual(["newfile.ts", "another.ts"]);
    });

    it("parses mixed status", () => {
        const status = " M src/index.ts\n?? newfile.ts\n D old.ts";
        const result = parseStatus(status);
        expect(result).toEqual(["src/index.ts", "newfile.ts", "old.ts"]);
    });

    it("handles empty status", () => {
        const result = parseStatus("");
        expect(result).toEqual([]);
    });

    it("handles renamed files", () => {
        const status = "R  old.ts -> new.ts";
        const result = parseStatus(status);
        expect(result).toEqual(["new.ts"]);
    });
});
