import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { NodeFileSystem } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Path } from "effect";

import { findConfigFile } from "../../src/services/findConfigFile.ts";

describe("findConfigFile", () => {
    let tmpDir: string;

    const withTmpDir = <A, E, R>(f: (dir: string) => Effect.Effect<A, E, R>) => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ogit-test-"));
        return f(tmpDir).pipe(
            Effect.ensuring(Effect.sync(() => fs.rmSync(tmpDir, { recursive: true, force: true }))),
            Effect.provide(Layer.mergeAll(NodeFileSystem.layer, Path.layer)),
        );
    };

    it.effect("finds .ogit.kdl in the current directory", () =>
        withTmpDir((dir) =>
            Effect.gen(function* () {
                const configPath = path.join(dir, ".ogit.kdl");
                fs.writeFileSync(configPath, `model "test"`);

                const result = yield* findConfigFile(dir);
                expect(Option.getOrThrow(result)).toBe(configPath);
            }),
        ),
    );

    it.effect("finds .ogit.kdl in a parent directory", () =>
        withTmpDir((dir) =>
            Effect.gen(function* () {
                const configPath = path.join(dir, ".ogit.kdl");
                fs.writeFileSync(configPath, `model "test"`);

                const subDir = path.join(dir, "sub", "deep");
                fs.mkdirSync(subDir, { recursive: true });

                const result = yield* findConfigFile(subDir);
                expect(Option.getOrThrow(result)).toBe(configPath);
            }),
        ),
    );

    it.effect("returns None when no config exists", () =>
        withTmpDir((dir) =>
            Effect.gen(function* () {
                const result = yield* findConfigFile(dir);
                expect(Option.isNone(result)).toBe(true);
            }),
        ),
    );
});
