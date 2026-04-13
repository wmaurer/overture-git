import { describe, expect, it } from "@effect/vitest";

import { mergeConfigs } from "../../src/domain/mergeConfigs.ts";

import type { OgitConfig } from "../../src/domain/OgitConfig.ts";

describe("mergeConfigs", () => {
    it("later configs override earlier ones", () => {
        const global: OgitConfig = { model: "claude-haiku-4-5" };
        const local: OgitConfig = { model: "claude-sonnet-4-20250514" };
        const result = mergeConfigs(global, local);
        expect(result.model).toBe("claude-sonnet-4-20250514");
    });

    it("preserves values not overridden", () => {
        const global: OgitConfig = { "api-key": "sk-123", model: "claude-haiku-4-5" };
        const local: OgitConfig = { model: "claude-sonnet-4-20250514" };
        const result = mergeConfigs(global, local);
        expect(result["api-key"]).toBe("sk-123");
        expect(result.model).toBe("claude-sonnet-4-20250514");
    });

    it("deep merges nested commit config", () => {
        const global: OgitConfig = { commit: { "system-prompt": "global prompt" } };
        const local: OgitConfig = { commit: { "system-prompt": "local prompt" } };
        const result = mergeConfigs(global, local);
        expect(result.commit?.["system-prompt"]).toBe("local prompt");
    });

    it("handles empty configs", () => {
        const result = mergeConfigs({}, {});
        expect(result).toEqual({});
    });

    it("merges three configs in order", () => {
        const a: OgitConfig = { model: "a" };
        const b: OgitConfig = { model: "b" };
        const c: OgitConfig = { model: "c" };
        const result = mergeConfigs(a, b, c);
        expect(result.model).toBe("c");
    });
});
