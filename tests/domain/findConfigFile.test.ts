import { describe, expect, it, beforeEach, afterEach } from "@effect/vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { findConfigFile } from "../../src/domain/findConfigFile.ts";

describe("findConfigFile", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ogit-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("finds .ogit.kdl in the current directory", () => {
        const configPath = path.join(tmpDir, ".ogit.kdl");
        fs.writeFileSync(configPath, `model "test"`);

        expect(findConfigFile(tmpDir)).toBe(configPath);
    });

    it("finds .ogit.kdl in a parent directory", () => {
        const configPath = path.join(tmpDir, ".ogit.kdl");
        fs.writeFileSync(configPath, `model "test"`);

        const subDir = path.join(tmpDir, "sub", "deep");
        fs.mkdirSync(subDir, { recursive: true });

        expect(findConfigFile(subDir)).toBe(configPath);
    });

    it("returns undefined when no config exists", () => {
        expect(findConfigFile(tmpDir)).toBeUndefined();
    });
});
