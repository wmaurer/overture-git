# Auto-staging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When nothing is staged, intelligently analyse unstaged files and stage them before generating a commit message.

**Architecture:** Two-phase AI approach — triage file names first (cheap), then analyse diffs for relevance grouping. Bolt onto existing commit flow; once files are staged, the existing path runs unchanged.

**Tech Stack:** Effect v4 (Schema, Services, Layers), @effect/ai-anthropic, effect/unstable/cli (Prompt)

---

### Task 1: Add new Git service methods

**Files:**
- Modify: `src/services/Git.ts:6-14` (service interface)
- Modify: `src/services/Git.ts:33-58` (implementations)
- Test: `tests/services/Git.test.ts` (create)

**Step 1: Write the failing tests**

Create `tests/services/Git.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/services/Git.test.ts`
Expected: FAIL — `addFiles` and `addAll` do not exist on Git service

**Step 3: Add the new methods to the Git service interface and implementation**

In `src/services/Git.ts`, add to the service interface (lines 6-14):

```typescript
readonly addFiles: (paths: ReadonlyArray<string>) => Effect.Effect<void, GitError>;
readonly addAll: () => Effect.Effect<void, GitError>;
readonly diffFiles: (paths: ReadonlyArray<string>) => Effect.Effect<string, GitError>;
readonly intentToAdd: (paths: ReadonlyArray<string>) => Effect.Effect<void, GitError>;
readonly resetFiles: (paths: ReadonlyArray<string>) => Effect.Effect<void, GitError>;
readonly numstat: () => Effect.Effect<string, GitError>;
```

Add implementations before the `return Git.of(...)`:

```typescript
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
```

Update the `Git.of(...)` call to include all new methods.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/services/Git.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/Git.ts tests/services/Git.test.ts
ogit commit -n
```

---

### Task 2: Add FileTriage and FileAnalysis schemas

**Files:**
- Modify: `src/domain/CommitMessage.ts:1-31`
- Test: `tests/domain/FileAnalysis.test.ts` (create)

**Step 1: Write the failing tests**

Create `tests/domain/FileAnalysis.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { FileAnalysis, FileTriage } from "../../src/domain/CommitMessage.ts";

describe("FileTriage", () => {
    it("parses valid triage response", () => {
        const input = {
            analyse: ["src/index.ts", "src/utils.ts"],
            skip: [{ path: "output.log", reason: "log file" }],
        };
        const result = Schema.decodeUnknownSync(FileTriage)(input);
        expect(result.analyse).toEqual(["src/index.ts", "src/utils.ts"]);
        expect(result.skip).toHaveLength(1);
        expect(result.skip[0].path).toBe("output.log");
    });
});

describe("FileAnalysis", () => {
    it("parses all-relevant response", () => {
        const input = {
            allRelevant: true,
            relevant: ["src/index.ts", "src/utils.ts"],
            irrelevant: [],
        };
        const result = Schema.decodeUnknownSync(FileAnalysis)(input);
        expect(result.allRelevant).toBe(true);
        expect(result.relevant).toEqual(["src/index.ts", "src/utils.ts"]);
        expect(result.irrelevant).toEqual([]);
    });

    it("parses mixed-relevance response", () => {
        const input = {
            allRelevant: false,
            relevant: ["src/index.ts"],
            irrelevant: [{ path: "vitest.config.ts", reason: "unrelated config change" }],
        };
        const result = Schema.decodeUnknownSync(FileAnalysis)(input);
        expect(result.allRelevant).toBe(false);
        expect(result.irrelevant).toHaveLength(1);
        expect(result.irrelevant[0].reason).toBe("unrelated config change");
    });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/domain/FileAnalysis.test.ts`
Expected: FAIL — `FileTriage` and `FileAnalysis` not exported

**Step 3: Add the schemas to CommitMessage.ts**

Append to `src/domain/CommitMessage.ts` after the `GitContext` class:

```typescript
export class FileTriage extends Schema.Class<FileTriage>("FileTriage")({
    analyse: Schema.Array(Schema.String),
    skip: Schema.Array(
        Schema.Struct({
            path: Schema.String,
            reason: Schema.String,
        }),
    ),
}) {}

export class FileAnalysis extends Schema.Class<FileAnalysis>("FileAnalysis")({
    allRelevant: Schema.Boolean,
    relevant: Schema.Array(Schema.String),
    irrelevant: Schema.Array(
        Schema.Struct({
            path: Schema.String,
            reason: Schema.String,
        }),
    ),
}) {}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/domain/FileAnalysis.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/domain/CommitMessage.ts tests/domain/FileAnalysis.test.ts
ogit commit -n
```

---

### Task 3: Add triage and analysis methods to CommitAi

**Files:**
- Modify: `src/services/CommitAi.ts:34-59` (service interface + layer)
- Test: `tests/services/CommitAi.test.ts` (add tests)

**Step 1: Write the failing tests**

Add to `tests/services/CommitAi.test.ts`, new describe blocks:

```typescript
import { FileAnalysis, FileTriage } from "../../src/domain/CommitMessage.ts";

// Add a second mock model layer for triage/analysis tests
let triageCallCount = 0;

const makeTriageJson = () =>
    JSON.stringify({
        analyse: ["src/index.ts", "src/utils.ts"],
        skip: [{ path: "output.log", reason: "log file" }],
    });

const makeAnalysisJson = (allRelevant: boolean) =>
    JSON.stringify(
        allRelevant
            ? { allRelevant: true, relevant: ["src/index.ts", "src/utils.ts"], irrelevant: [] }
            : {
                  allRelevant: false,
                  relevant: ["src/index.ts"],
                  irrelevant: [{ path: "src/utils.ts", reason: "unrelated utility change" }],
              },
    );

const TriageModelLayer = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
        generateText: () => {
            triageCallCount++;
            const json = triageCallCount === 1 ? makeTriageJson() : makeAnalysisJson(triageCallCount === 2);
            return Effect.succeed([
                { type: "text" as const, text: json },
                {
                    type: "finish" as const,
                    reason: "stop" as const,
                    usage: {
                        inputTokens: { uncached: 50, total: 50, cacheRead: 0, cacheWrite: 0 },
                        outputTokens: { total: 30, text: undefined, reasoning: undefined },
                    },
                    response: undefined,
                },
            ]);
        },
        streamText: () => Stream.die("not implemented"),
    }),
);

const TriageCommitAiLayer = Layer.merge(CommitAi.layer, TriageModelLayer);

describe("CommitAi.triageFiles", () => {
    it.effect("classifies files as analyse or skip", () =>
        Effect.gen(function* () {
            triageCallCount = 0;
            const commitAi = yield* CommitAi;
            const result = yield* commitAi.triageFiles(["src/index.ts", "src/utils.ts", "output.log"], "feat/thing");
            expect(result.analyse).toContain("src/index.ts");
            expect(result.skip).toHaveLength(1);
            expect(result.skip[0].path).toBe("output.log");
        }).pipe(Effect.provide(TriageCommitAiLayer)),
    );
});

describe("CommitAi.analyseFiles", () => {
    it.effect("groups files by relevance", () =>
        Effect.gen(function* () {
            triageCallCount = 1; // skip triage response, go to analysis
            const commitAi = yield* CommitAi;
            const result = yield* commitAi.analyseFiles("diff content here", "feat/thing");
            expect(result.relevant).toContain("src/index.ts");
        }).pipe(Effect.provide(TriageCommitAiLayer)),
    );
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/services/CommitAi.test.ts`
Expected: FAIL — `triageFiles` and `analyseFiles` do not exist

**Step 3: Implement the new CommitAi methods**

In `src/services/CommitAi.ts`, add to the service interface:

```typescript
readonly triageFiles: (
    files: ReadonlyArray<string>,
    branch: string,
) => Effect.Effect<FileTriage, CommitAiError>;
readonly analyseFiles: (
    diff: string,
    branch: string,
) => Effect.Effect<FileAnalysis, CommitAiError>;
```

Add triage system prompt and user prompt builder:

```typescript
const triageSystemPrompt = `You are a file triage assistant for git commits. Given a list of changed file paths, classify each as:
- "analyse": source code, config, or other files that should be reviewed for a commit
- "skip": output files, logs, generated artifacts, binaries, or files that should not be sent for further analysis

Examples of files to skip: log files, build output, manifests, coverage reports, lock files, compiled output, cache files.
When in doubt, include the file in "analyse".`;

const buildTriagePrompt = (files: ReadonlyArray<string>, branch: string): string =>
    `Classify these changed files on branch "${branch}":\n\n${files.map((f) => `- ${f}`).join("\n")}`;

const analysisSystemPrompt = `You are a git commit analyst. Given a diff of changed files, determine whether all changes belong in a single commit or if some are unrelated.

Rules:
- Group changes that form a single logical unit (e.g., a feature + its tests + its docs)
- Flag files that seem unrelated to the main body of changes
- When in doubt, consider files relevant
- A file is irrelevant only if it clearly serves a different purpose than the majority of changes`;

const buildAnalysisPrompt = (diff: string, branch: string): string =>
    `Analyse the following diff from branch "${branch}" and determine which files belong together in a single commit.\n\n## Diff\n${diff}`;
```

Add implementations using `Chat.fromPrompt` + `generateObject`:

```typescript
triageFiles: Effect.fn("CommitAi.triageFiles")(
    function* (files: ReadonlyArray<string>, branch: string) {
        const chat = yield* Chat.fromPrompt([
            { role: "system" as const, content: triageSystemPrompt },
            { role: "user" as const, content: buildTriagePrompt(files, branch) },
        ]);
        const result = yield* chat.generateObject({ objectName: "file_triage", prompt: [], schema: FileTriage });
        return result.value;
    },
    Effect.mapError(
        (error) => new CommitAiError({ reason: "generation_failed", message: String(error) }),
    ),
),

analyseFiles: Effect.fn("CommitAi.analyseFiles")(
    function* (diff: string, branch: string) {
        const chat = yield* Chat.fromPrompt([
            { role: "system" as const, content: analysisSystemPrompt },
            { role: "user" as const, content: buildAnalysisPrompt(diff, branch) },
        ]);
        const result = yield* chat.generateObject({ objectName: "file_analysis", prompt: [], schema: FileAnalysis });
        return result.value;
    },
    Effect.mapError(
        (error) => new CommitAiError({ reason: "generation_failed", message: String(error) }),
    ),
),
```

Import `FileTriage` and `FileAnalysis` from `../domain/CommitMessage.ts`.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/services/CommitAi.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/CommitAi.ts tests/services/CommitAi.test.ts
ogit commit -n
```

---

### Task 4: Add status parsing utility

**Files:**
- Create: `src/domain/parseStatus.ts`
- Test: `tests/domain/parseStatus.test.ts` (create)

We need to parse `git status --porcelain` output to extract file paths. The format is `XY path` where XY is the two-character status code.

**Step 1: Write the failing tests**

Create `tests/domain/parseStatus.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest";

import { parseStatus } from "../../src/domain/parseStatus.ts";

describe("parseStatus", () => {
    it("parses modified files", () => {
        const status = " M src/index.ts\n M src/utils.ts";
        const result = parseStatus(status);
        expect(result).toEqual(["src/index.ts", "src/utils.ts"]);
    });

    it("parses untracked files", () => {
        const status = "?? newfile.ts\n?? another.ts";
        const result = parseStatus(status);
        expect(result).toEqual(["newfile.ts", "another.ts"]);
    });

    it("parses mixed status", () => {
        const status = " M src/index.ts\n?? newfile.ts\n D old.ts";
        const result = parseStatus(status);
        expect(result).toEqual(["src/index.ts", "newfile.ts", "old.ts"]);
    });

    it("handles empty status", () => {
        const result = parseStatus("");
        expect(result).toEqual([]);
    });

    it("handles renamed files", () => {
        const status = "R  old.ts -> new.ts";
        const result = parseStatus(status);
        expect(result).toEqual(["new.ts"]);
    });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/domain/parseStatus.test.ts`
Expected: FAIL — module not found

**Step 3: Implement parseStatus**

Create `src/domain/parseStatus.ts`:

```typescript
export const parseStatus = (status: string): Array<string> => {
    if (status.trim() === "") return [];
    return status
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => {
            const path = line.slice(3);
            // Handle renames: "R  old.ts -> new.ts"
            const arrowIndex = path.indexOf(" -> ");
            return arrowIndex !== -1 ? path.slice(arrowIndex + 4) : path;
        });
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/domain/parseStatus.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/domain/parseStatus.ts tests/domain/parseStatus.test.ts
ogit commit -n
```

---

### Task 5: Add binary file detection utility

**Files:**
- Create: `src/domain/parseBinaryFiles.ts`
- Test: `tests/domain/parseBinaryFiles.test.ts` (create)

`git diff --numstat` outputs `-\t-\tfilename` for binary files. We need to parse this to filter them out.

**Step 1: Write the failing tests**

Create `tests/domain/parseBinaryFiles.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest";

import { parseBinaryFiles } from "../../src/domain/parseBinaryFiles.ts";

describe("parseBinaryFiles", () => {
    it("identifies binary files from numstat output", () => {
        const numstat = "10\t5\tsrc/index.ts\n-\t-\timage.png\n3\t1\tREADME.md";
        const result = parseBinaryFiles(numstat);
        expect(result).toEqual(["image.png"]);
    });

    it("returns empty array when no binaries", () => {
        const numstat = "10\t5\tsrc/index.ts\n3\t1\tREADME.md";
        const result = parseBinaryFiles(numstat);
        expect(result).toEqual([]);
    });

    it("handles empty input", () => {
        const result = parseBinaryFiles("");
        expect(result).toEqual([]);
    });

    it("handles multiple binary files", () => {
        const numstat = "-\t-\ta.png\n-\t-\tb.jpg\n1\t0\tc.ts";
        const result = parseBinaryFiles(numstat);
        expect(result).toEqual(["a.png", "b.jpg"]);
    });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/domain/parseBinaryFiles.test.ts`
Expected: FAIL — module not found

**Step 3: Implement parseBinaryFiles**

Create `src/domain/parseBinaryFiles.ts`:

```typescript
export const parseBinaryFiles = (numstat: string): Array<string> => {
    if (numstat.trim() === "") return [];
    return numstat
        .split("\n")
        .filter((line) => line.startsWith("-\t-\t"))
        .map((line) => line.slice(4));
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/domain/parseBinaryFiles.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/domain/parseBinaryFiles.ts tests/domain/parseBinaryFiles.test.ts
ogit commit -n
```

---

### Task 6: Implement autoStage orchestration in commit command

**Files:**
- Modify: `src/commands/commit.ts:34-135`

This is the main integration task. It wires everything together.

**Step 1: Modify the commit command to catch `nothing_staged` and branch**

In `src/commands/commit.ts`, replace the current context-gathering section (lines 54-62). The new flow:

1. Try `diffStaged()`. If it succeeds, proceed with existing flow.
2. If it fails with `nothing_staged`:
   - **Non-interactive:** run `git.addAll()`, then retry `diffStaged()` and continue.
   - **Interactive:** run the auto-stage flow, then retry `diffStaged()` and continue.

```typescript
// 1. Check for staged changes
const hasStagedChanges = yield* git.diffStaged().pipe(
    Effect.map(() => true),
    Effect.catchTag("GitError", (e) =>
        e.reason === "nothing_staged" ? Effect.succeed(false) : Effect.fail(e),
    ),
);

if (!hasStagedChanges) {
    if (config.nonInteractive) {
        yield* git.addAll();
    } else {
        yield* autoStage(git, commitAi);
    }
}

// 2. Gather context in parallel (now guaranteed to have staged changes)
const [diff, branch, status, recentCommits] = yield* Effect.all([
    git.diffStaged(),
    git.branch(),
    git.status(),
    git.log(10),
]);
```

**Step 2: Implement the autoStage function**

Add above the `commit` command definition:

```typescript
import { parseStatus } from "../domain/parseStatus.ts";
import { parseBinaryFiles } from "../domain/parseBinaryFiles.ts";
import { FileAnalysis, FileTriage } from "../domain/CommitMessage.ts";

const autoStage = (git: Git["Type"], commitAi: CommitAi["Type"]) =>
    Effect.gen(function* () {
        // 1. Get file list and branch
        const [status, branch] = yield* Effect.all([git.status(), git.branch()]);
        const files = parseStatus(status);

        if (files.length === 0) {
            return yield* new GitError({ reason: "nothing_staged", message: "No changes to commit." });
        }

        // 2. AI triage — classify files by name
        yield* Console.log("Analysing files...");
        const triage = yield* commitAi.triageFiles(files, branch);

        if (triage.analyse.length === 0) {
            return yield* new GitError({
                reason: "nothing_staged",
                message: "No files suitable for committing.",
            });
        }

        // 3. Filter out binary files
        yield* git.intentToAdd(triage.analyse);
        const numstatOutput = yield* git.numstat();
        yield* git.resetFiles(triage.analyse);

        const binaryFiles = parseBinaryFiles(numstatOutput);
        const textFiles = triage.analyse.filter((f) => !binaryFiles.includes(f));

        if (textFiles.length === 0) {
            return yield* new GitError({
                reason: "nothing_staged",
                message: "Only binary/output files found — nothing to analyse.",
            });
        }

        // 4. Get diffs for text files
        yield* git.intentToAdd(textFiles);
        const diff = yield* git.diffFiles(textFiles);
        yield* git.resetFiles(textFiles);

        // 5. AI analysis — group by relevance
        const analysis = yield* commitAi.analyseFiles(diff, branch);

        // 6. Stage based on analysis
        if (analysis.allRelevant) {
            yield* git.addFiles(textFiles);
        } else {
            // Show irrelevant files
            yield* Console.log("");
            yield* Console.log("These files seem unrelated to the main changes:");
            for (const file of analysis.irrelevant) {
                yield* Console.log(`  - ${file.path} (${file.reason})`);
            }
            yield* Console.log("");

            const exclude = yield* Prompt.confirm({
                message: "Exclude them from this commit?",
            });

            if (exclude) {
                yield* git.addFiles(analysis.relevant);
            } else {
                yield* git.addFiles(textFiles);
            }
        }

        // Log skipped files if any
        if (triage.skip.length > 0) {
            yield* Console.log("");
            yield* Console.log("Skipped (output/generated files):");
            for (const file of triage.skip) {
                yield* Console.log(`  - ${file.path} (${file.reason})`);
            }
        }
    });
```

**Step 3: Run all tests**

Run: `pnpm test`
Expected: All existing tests still PASS

**Step 4: Manual integration test**

1. Create some test files in a temp directory
2. Run `ogit commit` with no staged files
3. Verify the triage → analysis → staging → message generation flow works

**Step 5: Commit**

```bash
git add src/commands/commit.ts
ogit commit -n
```

---

### Task 7: Run full test suite and verify

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All PASS

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No errors

**Step 4: Build**

Run: `pnpm build`
Expected: Clean build

**Step 5: Final commit if any fixes needed**

```bash
git add <any fixed files>
ogit commit -n
```
