import { Context, Effect, Layer } from "effect";
import { FileSystem } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { EditorError } from "../domain/errors.ts";

export class Editor extends Context.Service<
    Editor,
    {
        readonly open: (content: string) => Effect.Effect<string, EditorError>;
    }
>()("@overture/Editor") {
    static layer = Layer.effect(
        Editor,
        Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

            const open = Effect.fn("Editor.open")(function* (content: string) {
                const editor = process.env.EDITOR ?? process.env.VISUAL ?? "vi";
                const tmpFile = yield* fs
                    .makeTempFile({ prefix: "overture-commit-", suffix: ".txt" })
                    .pipe(
                        Effect.mapError(
                            (error) =>
                                new EditorError({
                                    reason: "editor_failed",
                                    message: `Failed to create temp file: ${error.message}`,
                                }),
                        ),
                    );

                yield* fs
                    .writeFile(tmpFile, new TextEncoder().encode(content))
                    .pipe(
                        Effect.mapError(
                            (error) =>
                                new EditorError({
                                    reason: "editor_failed",
                                    message: `Failed to write temp file: ${error.message}`,
                                }),
                        ),
                    );

                const exitCode = yield* spawner
                    .exitCode(
                        ChildProcess.make(editor, [tmpFile], {
                            stdin: "inherit",
                            stdout: "inherit",
                            stderr: "inherit",
                        }),
                    )
                    .pipe(
                        Effect.mapError(
                            (error) =>
                                new EditorError({
                                    reason: "editor_failed",
                                    message: `Editor failed: ${error.message}`,
                                }),
                        ),
                    );

                if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
                    return yield* new EditorError({
                        reason: "editor_failed",
                        message: `Editor exited with code ${exitCode}`,
                    });
                }

                const data = yield* fs
                    .readFile(tmpFile)
                    .pipe(
                        Effect.mapError(
                            (error) =>
                                new EditorError({
                                    reason: "editor_failed",
                                    message: `Failed to read edited file: ${error.message}`,
                                }),
                        ),
                    );

                yield* fs.remove(tmpFile).pipe(Effect.ignore);

                return new TextDecoder().decode(data);
            });

            return Editor.of({ open });
        }),
    );
}
