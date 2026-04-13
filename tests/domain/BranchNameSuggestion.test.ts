import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { BranchNameSuggestion } from "../../src/domain/BranchNameSuggestion.ts";

describe("BranchNameSuggestion", () => {
    it("decodes a valid suggestion", () => {
        const result = Schema.decodeUnknownSync(BranchNameSuggestion)({
            name: "feat/add-worktree",
            reasoning: "Changes add a new worktree creation feature",
        });
        expect(result.name).toBe("feat/add-worktree");
        expect(result.reasoning).toBe("Changes add a new worktree creation feature");
    });
});
