import { describe, expect, it } from "@effect/vitest";

import { parseEditedMessage } from "../../src/domain/parseEditedMessage.ts";

describe("parseEditedMessage", () => {
    it("splits subject and body on first blank line", () => {
        const result = parseEditedMessage("feat: add login\n\n- Add session handling\n- Update middleware");
        expect(result).toEqual({
            subject: "feat: add login",
            body: "- Add session handling\n- Update middleware",
        });
    });

    it("returns empty body when no blank line separator", () => {
        const result = parseEditedMessage("feat: add login");
        expect(result).toEqual({
            subject: "feat: add login",
            body: "",
        });
    });

    it("trims whitespace from subject and body", () => {
        const result = parseEditedMessage("  feat: add login  \n\n  - bullet  \n");
        expect(result).toEqual({
            subject: "feat: add login",
            body: "- bullet",
        });
    });

    it("handles multiple blank lines between subject and body", () => {
        const result = parseEditedMessage("feat: add login\n\n\n- bullet one\n- bullet two");
        expect(result).toEqual({
            subject: "feat: add login",
            body: "- bullet one\n- bullet two",
        });
    });

    it("handles body without bullet markers", () => {
        const result = parseEditedMessage("feat: add login\n\nPlain text body here");
        expect(result).toEqual({
            subject: "feat: add login",
            body: "Plain text body here",
        });
    });
});
