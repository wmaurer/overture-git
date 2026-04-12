import { describe, expect, it } from "@effect/vitest";

import { parseKdlToObject } from "../../src/domain/parseKdl.ts";

describe("parseKdlToObject", () => {
    it("parses top-level string arguments", () => {
        const result = parseKdlToObject(`model "claude-sonnet-4-20250514"`);
        expect(result).toEqual({ model: "claude-sonnet-4-20250514" });
    });

    it("parses multiple top-level nodes", () => {
        const result = parseKdlToObject(`
            api-key "sk-ant-123"
            model "claude-haiku-4-5"
        `);
        expect(result).toEqual({
            "api-key": "sk-ant-123",
            model: "claude-haiku-4-5",
        });
    });

    it("parses nested children as objects", () => {
        const result = parseKdlToObject(`
            commit {
                system-prompt "You are a helper."
            }
        `);
        expect(result).toEqual({
            commit: { "system-prompt": "You are a helper." },
        });
    });

    it("parses multi-line strings", () => {
        const result = parseKdlToObject(`
            commit {
                system-prompt """
                    Line one.
                    Line two.
                    """
            }
        `);
        expect(result).toEqual({
            commit: { "system-prompt": "Line one.\nLine two." },
        });
    });

    it("parses boolean and number values", () => {
        const result = parseKdlToObject(`
            debug #true
            max-retries 3
        `);
        expect(result).toEqual({ debug: true, "max-retries": 3 });
    });

    it("returns empty object for empty document", () => {
        const result = parseKdlToObject("");
        expect(result).toEqual({});
    });

    it("throws on invalid KDL", () => {
        expect(() => parseKdlToObject("{{{")).toThrow();
    });
});
