import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { FileAnalysis, FileTriage } from "../../src/domain/FileAnalysis.ts";

describe("FileTriage", () => {
    it("parses valid triage response", () => {
        const input = {
            analyse: ["src/index.ts", "src/utils.ts"],
            skip: [{ path: "output.log", reason: "log file" }],
        };
        const result = Schema.decodeUnknownSync(FileTriage)(input);
        expect(result.analyse).toEqual(["src/index.ts", "src/utils.ts"]);
        expect(result.skip).toHaveLength(1);
        expect(result.skip[0].path).toBe("output.log");
    });
});

describe("FileAnalysis", () => {
    it("parses all-relevant response", () => {
        const input = {
            allRelevant: true,
            relevant: ["src/index.ts", "src/utils.ts"],
            irrelevant: [],
        };
        const result = Schema.decodeUnknownSync(FileAnalysis)(input);
        expect(result.allRelevant).toBe(true);
        expect(result.relevant).toEqual(["src/index.ts", "src/utils.ts"]);
        expect(result.irrelevant).toEqual([]);
    });

    it("parses mixed-relevance response", () => {
        const input = {
            allRelevant: false,
            relevant: ["src/index.ts"],
            irrelevant: [{ path: "vitest.config.ts", reason: "unrelated config change" }],
        };
        const result = Schema.decodeUnknownSync(FileAnalysis)(input);
        expect(result.allRelevant).toBe(false);
        expect(result.irrelevant).toHaveLength(1);
        expect(result.irrelevant[0].reason).toBe("unrelated config change");
    });
});
