import { Context, Effect, Layer } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { GitError } from "../domain/errors.ts";

export class Git extends Context.Service<
    Git,
    {
        readonly diffStaged: () => Effect.Effect<string, GitError>;
        readonly status: () => Effect.Effect<string, GitError>;
        readonly log: (n: number) => Effect.Effect<string, GitError>;
        readonly branch: () => Effect.Effect<string, GitError>;
        readonly commit: (subject: string, body: string) => Effect.Effect<void, GitError>;
        readonly addFiles: (paths: ReadonlyArray<string>) => Effect.Effect<void, GitError>;
        readonly addAll: () => Effect.Effect<void, GitError>;
        readonly diffFiles: (paths: ReadonlyArray<string>) => Effect.Effect<string, GitError>;
        readonly intentToAdd: (paths: ReadonlyArray<string>) => Effect.Effect<void, GitError>;
        readonly resetFiles: (paths: ReadonlyArray<string>) => Effect.Effect<void, GitError>;
        readonly numstat: () => Effect.Effect<string, GitError>;
        readonly stash: () => Effect.Effect<void, GitError>;
        readonly stashPopIn: (cwd: string) => Effect.Effect<void, GitError>;
        readonly worktreeAdd: (path: string, branch: string) => Effect.Effect<void, GitError>;
        readonly diffAll: () => Effect.Effect<string, GitError>;
        readonly repoRoot: () => Effect.Effect<string, GitError>;
    }
>()("@overture/Git") {
    static layer = Layer.effect(
        Git,
        Effect.gen(function* () {
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

            const run = Effect.fn("Git.run")(function* (args: ReadonlyArray<string>) {
                return yield* spawner
                    .string(ChildProcess.make("git", args))
                    .pipe(
                        Effect.mapError(
                            (error) =>
                                new GitError({
                                    reason: "command_failed",
                                    message: `git ${args.join(" ")}: ${error.message}`,
                                }),
                        ),
                    );
            });

            const diffStaged = Effect.fn("Git.diffStaged")(function* () {
                const diff = yield* run(["diff", "--staged"]);
                if (diff.trim() === "") {
                    return yield* new GitError({
                        reason: "nothing_staged",
                        message: "Nothing staged. Use `git add` first.",
                    });
                }
                return diff;
            });

            const status = Effect.fn("Git.status")(function* () {
                return yield* run(["status", "--porcelain"]);
            });

            const log = Effect.fn("Git.log")(function* (n: number) {
                return yield* run(["log", "--oneline", "-n", `${n}`]).pipe(Effect.orElseSucceed(() => ""));
            });

            const branch = Effect.fn("Git.branch")(function* () {
                return yield* run(["branch", "--show-current"]).pipe(Effect.map((s) => s.trim()));
            });

            const commit = Effect.fn("Git.commit")(function* (subject: string, body: string) {
                yield* run(["commit", "-m", subject, "-m", body]);
            });

            const addFiles = Effect.fn("Git.addFiles")(function* (paths: ReadonlyArray<string>) {
                if (paths.length === 0) return;
                yield* run(["add", ...paths]);
            });

            const addAll = Effect.fn("Git.addAll")(function* () {
                yield* run(["add", "-A"]);
            });

            const diffFiles = Effect.fn("Git.diffFiles")(function* (paths: ReadonlyArray<string>) {
                if (paths.length === 0) return "";
                return yield* run(["diff", ...paths]);
            });

            const intentToAdd = Effect.fn("Git.intentToAdd")(function* (paths: ReadonlyArray<string>) {
                if (paths.length === 0) return;
                yield* run(["add", "-N", ...paths]);
            });

            const resetFiles = Effect.fn("Git.resetFiles")(function* (paths: ReadonlyArray<string>) {
                if (paths.length === 0) return;
                yield* run(["reset", "--", ...paths]);
            });

            const numstat = Effect.fn("Git.numstat")(function* () {
                return yield* run(["diff", "--numstat"]);
            });

            const stash = Effect.fn("Git.stash")(function* () {
                yield* run(["stash", "--include-untracked"]);
            });

            const stashPopIn = Effect.fn("Git.stashPopIn")(function* (cwd: string) {
                yield* run(["-C", cwd, "stash", "pop"]);
            });

            const worktreeAdd = Effect.fn("Git.worktreeAdd")(function* (path: string, branch: string) {
                yield* run(["worktree", "add", "-b", branch, path]);
            });

            const diffAll = Effect.fn("Git.diffAll")(function* () {
                return yield* run(["diff", "HEAD"]).pipe(Effect.orElseSucceed(() => ""));
            });

            const repoRoot = Effect.fn("Git.repoRoot")(function* () {
                return yield* run(["rev-parse", "--show-toplevel"]).pipe(Effect.map((s) => s.trim()));
            });

            return Git.of({
                diffStaged,
                status,
                log,
                branch,
                commit,
                addFiles,
                addAll,
                diffFiles,
                intentToAdd,
                resetFiles,
                numstat,
                stash,
                stashPopIn,
                worktreeAdd,
                diffAll,
                repoRoot,
            });
        }),
    );
}
