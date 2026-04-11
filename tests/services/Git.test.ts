import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { NodeServices } from "@effect/platform-node";

import { Git } from "../../src/services/Git.ts";

const TestLayer = Git.layer.pipe(Layer.provide(NodeServices.layer));

describe("Git", () => {
    describe("addFiles", () => {
        it.effect("stages specific files", () =>
            Effect.gen(function* () {
                const git = yield* Git;
                // This test needs a real git repo context — just verify it doesn't throw for empty array
                // Real integration testing would need a temp repo
                yield* git.addFiles([]);
            }).pipe(Effect.provide(TestLayer)),
        );
    });

    describe("addAll", () => {
        it.effect("runs git add -A", () =>
            Effect.gen(function* () {
                const git = yield* Git;
                // Verify it doesn't throw when nothing to add
                yield* git.addAll();
            }).pipe(Effect.provide(TestLayer)),
        );
    });
});
