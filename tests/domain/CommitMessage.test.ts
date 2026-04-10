import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { CommitMessage } from "../../src/domain/CommitMessage.ts";

describe("CommitMessage", () => {
    it("formats subject line without scope", () => {
        const msg = new CommitMessage({
            type: "feat",
            scope: Option.none(),
            subject: "add commit message generation",
            bullets: ["Wire up AI service"],
        });
        expect(msg.subjectLine).toBe("feat: add commit message generation");
    });

    it("formats subject line with scope", () => {
        const msg = new CommitMessage({
            type: "fix",
            scope: Option.some("cli"),
            subject: "handle empty diff gracefully",
            bullets: ["Check staged diff before calling AI"],
        });
        expect(msg.subjectLine).toBe("fix(cli): handle empty diff gracefully");
    });

    it("formats body as bullet list", () => {
        const msg = new CommitMessage({
            type: "refactor",
            scope: Option.none(),
            subject: "restructure services",
            bullets: ["Extract Git service", "Extract CommitAi module"],
        });
        expect(msg.body).toBe("- Extract Git service\n- Extract CommitAi module");
    });

    it("formats full message with blank line separator", () => {
        const msg = new CommitMessage({
            type: "feat",
            scope: Option.some("git"),
            subject: "add commit command",
            bullets: ["Analyze staged changes", "Generate message via AI"],
        });
        expect(msg.fullMessage).toBe(
            "feat(git): add commit command\n\n- Analyze staged changes\n- Generate message via AI",
        );
    });
});
