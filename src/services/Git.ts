import { Context, Effect, Layer } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { GitError } from "../domain/errors.ts"

export class Git extends Context.Service<
    Git,
    {
        readonly diffStaged: () => Effect.Effect<string, GitError>
        readonly status: () => Effect.Effect<string, GitError>
        readonly log: (n: number) => Effect.Effect<string, GitError>
        readonly branch: () => Effect.Effect<string, GitError>
        readonly commit: (subject: string, body: string) => Effect.Effect<void, GitError>
    }
>()("@overture/Git") {
    static layer = Layer.effect(
        Git,
        Effect.gen(function* () {
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

            const run = Effect.fn("Git.run")(function* (args: ReadonlyArray<string>) {
                return yield* spawner.string(ChildProcess.make("git", args)).pipe(
                    Effect.mapError(
                        (error) =>
                            new GitError({
                                reason: "command_failed",
                                message: `git ${args.join(" ")}: ${error.message}`,
                            }),
                    ),
                )
            })

            const diffStaged = Effect.fn("Git.diffStaged")(function* () {
                const diff = yield* run(["diff", "--staged"])
                if (diff.trim() === "") {
                    return yield* new GitError({
                        reason: "nothing_staged",
                        message: "Nothing staged. Use `git add` first.",
                    })
                }
                return diff
            })

            const status = Effect.fn("Git.status")(function* () {
                return yield* run(["status", "--porcelain"])
            })

            const log = Effect.fn("Git.log")(function* (n: number) {
                return yield* run(["log", "--oneline", "-n", `${n}`]).pipe(
                    Effect.orElseSucceed(() => ""),
                )
            })

            const branch = Effect.fn("Git.branch")(function* () {
                return yield* run(["branch", "--show-current"]).pipe(Effect.map((s) => s.trim()))
            })

            const commit = Effect.fn("Git.commit")(function* (subject: string, body: string) {
                yield* run(["commit", "-m", subject, "-m", body])
            })

            return Git.of({ diffStaged, status, log, branch, commit })
        }),
    )
}
