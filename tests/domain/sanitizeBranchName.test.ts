import { describe, expect, it } from "@effect/vitest";

import { sanitizeBranchName } from "../../src/domain/sanitizeBranchName.ts";

describe("sanitizeBranchName", () => {
    it("replaces slashes with dashes", () => {
        expect(sanitizeBranchName("feat/new-function")).toBe("feat-new-function");
    });

    it("strips invalid characters", () => {
        expect(sanitizeBranchName("feat/hello@world!")).toBe("feat-helloworld");
    });

    it("preserves dots", () => {
        expect(sanitizeBranchName("fix/v1.2.3")).toBe("fix-v1.2.3");
    });

    it("preserves dashes", () => {
        expect(sanitizeBranchName("refactor/some-thing")).toBe("refactor-some-thing");
    });

    it("handles multiple slashes", () => {
        expect(sanitizeBranchName("feat/scope/detail")).toBe("feat-scope-detail");
    });
});
