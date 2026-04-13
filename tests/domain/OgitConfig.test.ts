import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { OgitConfigSchema, type OgitConfig } from "../../src/domain/OgitConfig.ts";

const decode = (input: unknown): OgitConfig => Schema.decodeUnknownSync(OgitConfigSchema)(input);

describe("OgitConfigSchema", () => {
    it("decodes a full config", () => {
        const result = decode({
            "api-key": "sk-ant-123",
            model: "claude-sonnet-4-20250514",
            commit: { "system-prompt": "You are a helper." },
        });
        expect(result["api-key"]).toBe("sk-ant-123");
        expect(result.model).toBe("claude-sonnet-4-20250514");
        expect(result.commit?.["system-prompt"]).toBe("You are a helper.");
    });

    it("decodes an empty config (all optional)", () => {
        const result = decode({});
        expect(result["api-key"]).toBeUndefined();
        expect(result.model).toBeUndefined();
        expect(result.commit).toBeUndefined();
    });

    it("rejects invalid types", () => {
        expect(() => decode({ model: 123 })).toThrow();
    });
});
