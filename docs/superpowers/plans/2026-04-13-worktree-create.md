# Worktree Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `ogit worktree create` command that creates git worktrees with AI-powered branch name suggestion when the working tree is dirty.

**Architecture:** New command in `src/commands/worktree.ts` orchestrates git operations (stash, worktree add, stash pop) and AI branch name suggestion. Existing `CommitAi` service is renamed to `OgitAi` and extended with `suggestBranchName`. `Git` service gets stash/worktree/diff methods.

**Tech Stack:** Effect v4, Effect CLI (`Command`, `Prompt`), `@effect/ai-anthropic`, vitest + `@effect/vitest`

**Spec:** `docs/superpowers/specs/2026-04-13-worktree-create-design.md`

---

### Task 1: Rename CommitAi → OgitAi

**Files:**
- Rename: `src/services/CommitAi.ts` → `src/services/OgitAi.ts`
- Modify: `src/commands/commit.ts`
- Modify: `src/domain/errors.ts`

- [ ] **Step 1: Rename the file**

```bash
git mv src/services/CommitAi.ts src/services/OgitAi.ts
```

- [ ] **Step 2: Rename class and tag inside `src/services/OgitAi.ts`**

Replace `CommitAi` with `OgitAi` throughout the file. Replace the tag `"@overture/CommitAi"` with `"@overture/OgitAi"`. Keep all method implementations identical.

- [ ] **Step 3: Rename error class in `src/domain/errors.ts`**

Rename `CommitAiError` to `OgitAiError`. Update the tag from `"CommitAiError"` to `"OgitAiError"`.

- [ ] **Step 4: Update imports in `src/commands/commit.ts`**

Change:
```typescript
import { CommitAi, DEFAULT_COMMIT_SYSTEM_PROMPT } from "../services/CommitAi.ts";
```
to:
```typescript
import { OgitAi, DEFAULT_COMMIT_SYSTEM_PROMPT } from "../services/OgitAi.ts";
```

Update all references: `CommitAi` → `OgitAi`, `CommitAiError` → `OgitAiError` (in the `catchTag`).

- [ ] **Step 5: Verify no other files reference `CommitAi`**

```bash
rg "CommitAi" src/
```

Expected: no matches.

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7: Run existing tests**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/services/OgitAi.ts src/services/CommitAi.ts src/commands/commit.ts src/domain/errors.ts
ogit commit -n
```

---

### Task 2: Add BranchNameSuggestion schema

**Files:**
- Create: `src/domain/BranchNameSuggestion.ts`
- Test: `tests/domain/BranchNameSuggestion.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/domain/BranchNameSuggestion.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/domain/BranchNameSuggestion.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/BranchNameSuggestion.ts`**

```typescript
import { Schema } from "effect";

export class BranchNameSuggestion extends Schema.Class<BranchNameSuggestion>("BranchNameSuggestion")({
    name: Schema.String,
    reasoning: Schema.String,
}) {}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/domain/BranchNameSuggestion.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/BranchNameSuggestion.ts tests/domain/BranchNameSuggestion.test.ts
ogit commit -n
```

---

### Task 3: Add sanitizeBranchName utility

**Files:**
- Create: `src/domain/sanitizeBranchName.ts`
- Test: `tests/domain/sanitizeBranchName.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/domain/sanitizeBranchName.test.ts`:

```typescript
import { describe, expect, it } from "@effect/vitest";

import { sanitizeBranchName } from "../../src/domain/sanitizeBranchName.ts";

describe("sanitizeBranchName", () => {
    it("replaces slashes with dashes", () => {
        expect(sanitizeBranchName("feat/new-function")).toBe("feat-new-function");
    });

    it("strips invalid characters", () => {
        expect(sanitizeBranchName("feat/hello@world!")).toBe("feat-helloworld");
    });

    it("preserves dots", () => {
        expect(sanitizeBranchName("fix/v1.2.3")).toBe("fix-v1.2.3");
    });

    it("preserves dashes", () => {
        expect(sanitizeBranchName("refactor/some-thing")).toBe("refactor-some-thing");
    });

    it("handles multiple slashes", () => {
        expect(sanitizeBranchName("feat/scope/detail")).toBe("feat-scope-detail");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test tests/domain/sanitizeBranchName.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/sanitizeBranchName.ts`**

```typescript
export const sanitizeBranchName = (name: string): string =>
    name.replace(/\//g, "-").replace(/[^a-zA-Z0-9\-\.]/g, "");
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test tests/domain/sanitizeBranchName.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/sanitizeBranchName.ts tests/domain/sanitizeBranchName.test.ts
ogit commit -n
```

---

### Task 4: Extend Git service with new methods

**Files:**
- Modify: `src/services/Git.ts`
- Modify: `src/domain/errors.ts` (add `WorktreeError`)

- [ ] **Step 1: Add `WorktreeError` to `src/domain/errors.ts`**

Add after existing error classes:

```typescript
export class WorktreeError extends Schema.TaggedErrorClass<WorktreeError>()("WorktreeError", {
    reason: Schema.Literals([
        "stash-failed",
        "worktree-create-failed",
        "stash-pop-failed",
        "ai-failed-changes-restored",
    ]),
    message: Schema.String,
}) {}
```

- [ ] **Step 2: Add new methods to the `Git` service interface in `src/services/Git.ts`**

Add to the service type definition:

```typescript
readonly stash: () => Effect.Effect<void, GitError>;
readonly stashPopIn: (cwd: string) => Effect.Effect<void, GitError>;
readonly worktreeAdd: (path: string, branch: string) => Effect.Effect<void, GitError>;
readonly diffAll: () => Effect.Effect<string, GitError>;
readonly repoRoot: () => Effect.Effect<string, GitError>;
```

- [ ] **Step 3: Implement the new methods inside the `Layer.effect` block**

After the existing `numstat` implementation, add:

```typescript
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
```

- [ ] **Step 4: Add the new methods to the `Git.of({...})` return object**

Add `stash`, `stashPopIn`, `worktreeAdd`, `diffAll`, `repoRoot` to the existing return object.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Run all tests**

```bash
pnpm test
```

Expected: all pass (no regressions).

- [ ] **Step 7: Commit**

```bash
git add src/services/Git.ts src/domain/errors.ts
ogit commit -n
```

---

### Task 5: Add `suggestBranchName` to OgitAi

**Files:**
- Modify: `src/services/OgitAi.ts`

- [ ] **Step 1: Import `BranchNameSuggestion` at the top of `src/services/OgitAi.ts`**

```typescript
import { BranchNameSuggestion } from "../domain/BranchNameSuggestion.ts";
```

- [ ] **Step 2: Add the system prompt constant**

After the existing `analysisSystemPrompt`, add:

```typescript
const branchNameSystemPrompt = `You are a branch name assistant. Given a git diff, suggest a single conventional branch name.

Format: <type>/<short-description>
- type: one of feat, fix, refactor, chore, docs, test, perf, style
- short-description: concise, kebab-case, max 4 words

Rules:
- Analyse the overall intent of the changes, not individual files
- Pick the most prominent change type
- The description should capture WHAT is being done, not HOW
- Return exactly one suggestion`;
```

- [ ] **Step 3: Add the user prompt builder**

```typescript
const buildBranchNamePrompt = (diff: string): string =>
    `Suggest a branch name for the following changes:\n\n## Diff\n${diff}`;
```

- [ ] **Step 4: Add `suggestBranchName` to the service type definition**

Add to the service interface:

```typescript
readonly suggestBranchName: (
    diff: string,
) => Effect.Effect<BranchNameSuggestion, OgitAiError, LanguageModel.LanguageModel>;
```

(Update the error type from `CommitAiError` to `OgitAiError` if not already done in Task 1.)

- [ ] **Step 5: Implement the method in the layer**

Add after `analyseFiles` implementation:

```typescript
suggestBranchName: Effect.fn("OgitAi.suggestBranchName")(
    function* (diff: string) {
        const chat = yield* Chat.fromPrompt([
            { role: "system", content: branchNameSystemPrompt },
            { role: "user", content: buildBranchNamePrompt(diff) },
        ]);
        const result = yield* chat.generateObject({
            objectName: "branch_name_suggestion",
            prompt: [],
            schema: BranchNameSuggestion,
        });
        return result.value;
    },
    Effect.mapError((error) => new OgitAiError({ reason: "generation_failed", message: String(error) })),
),
```

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/services/OgitAi.ts
ogit commit -n
```

---

### Task 6: Create `ogit worktree create` command

**Files:**
- Create: `src/commands/worktree.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `src/commands/worktree.ts`**

```typescript
import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { FileSystem } from "@effect/platform";
import { Config, Console, Effect, Layer, Option } from "effect";
import { Command, Prompt } from "effect/unstable/cli";
import envPaths from "env-paths";

import { ConfigSetupError, WorktreeError } from "../domain/errors.ts";
import { parseStatus } from "../domain/parseStatus.ts";
import { sanitizeBranchName } from "../domain/sanitizeBranchName.ts";
import { Git } from "../services/Git.ts";
import { OgitAi } from "../services/OgitAi.ts";
import { OgitConfigService } from "../services/OgitConfig.ts";

const ensureWorktreesDir = Effect.fn("ensureWorktreesDir")(function* (repoRoot: string) {
    const fs = yield* FileSystem.FileSystem;
    const worktreesDir = `${repoRoot}/.worktrees`;

    // Create .worktrees/ directory if it doesn't exist
    yield* fs.makeDirectory(worktreesDir).pipe(Effect.catchTag("SystemError", () => Effect.void));

    // Ensure .worktrees is in .gitignore
    const gitignorePath = `${repoRoot}/.gitignore`;
    const content = yield* fs.readFileString(gitignorePath).pipe(Effect.orElseSucceed(() => ""));
    const lines = content.split("\n");
    const hasEntry = lines.some((line) => line.trim() === "/.worktrees" || line.trim() === ".worktrees");

    if (!hasEntry) {
        const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
        yield* fs.writeFileString(gitignorePath, `${content}${separator}/.worktrees\n`);
    }

    return worktreesDir;
});

const aiLayer = (ogitConfigLayer: Layer.Layer<OgitConfigService>) =>
    Layer.mergeAll(
        OgitAi.layer,
        Layer.unwrap(
            Effect.gen(function* () {
                const ogitConfig = yield* OgitConfigService;
                const model = Option.getOrElse(ogitConfig.model, () => "claude-haiku-4-5");
                return AnthropicLanguageModel.model(model);
            }),
        ),
    ).pipe(
        Layer.provide(
            Layer.unwrap(
                Effect.gen(function* () {
                    const ogitConfig = yield* OgitConfigService;
                    const envApiKey = yield* Config.option(Config.redacted("OGIT_API_KEY"));

                    const apiKey = Option.orElse(envApiKey, () => ogitConfig.apiKey);
                    if (Option.isNone(apiKey)) {
                        return yield* new ConfigSetupError({
                            reason: "missing_api_key",
                            message: "No API key found",
                            globalConfigPath: `${envPaths("ogit", { suffix: "" }).config}/config.kdl`,
                        });
                    }

                    return AnthropicClient.layerConfig({ apiKey: Config.succeed(apiKey.value) });
                }),
            ),
        ),
        Layer.provideMerge(ogitConfigLayer),
    );

const suggestBranchNameFromDiff = (diff: string) =>
    Effect.gen(function* () {
        const ogitAi = yield* OgitAi;
        return yield* ogitAi.suggestBranchName(diff);
    }).pipe(Effect.provide(aiLayer(OgitConfigService.layer({}))));

const create = Command.make("create", {}, () =>
    Effect.gen(function* () {
        const git = yield* Git;
        const repoRoot = yield* git.repoRoot();
        const worktreesDir = yield* ensureWorktreesDir(repoRoot);

        // Check if working tree is clean
        const status = yield* git.status();
        const files = parseStatus(status);
        const isClean = files.length === 0;

        let branchName: string;

        if (isClean) {
            // Clean path: just ask for a branch name
            branchName = yield* Prompt.text({ message: "Branch name:" });
        } else {
            // Dirty path: capture diff, stash, suggest name

            // Capture untracked files for intent-to-add
            const untrackedFiles = status
                .split("\n")
                .filter((line) => line.startsWith("??"))
                .map((line) => line.slice(3));

            // Intent-to-add untracked files so they appear in diff
            if (untrackedFiles.length > 0) {
                yield* git.intentToAdd(untrackedFiles);
            }

            // Capture full diff (staged + unstaged + newly tracked)
            const diff = yield* git.diffAll();

            // Undo intent-to-add
            if (untrackedFiles.length > 0) {
                yield* git.resetFiles(untrackedFiles);
            }

            // Stash everything
            yield* git.stash().pipe(
                Effect.mapError(
                    () => new WorktreeError({ reason: "stash-failed", message: "Failed to stash changes." }),
                ),
            );

            // Get AI suggestion — if it fails, pop stash to restore changes
            const suggestion = yield* suggestBranchNameFromDiff(diff).pipe(
                Effect.catchTag("OgitAiError", (error) =>
                    Effect.gen(function* () {
                        yield* git.stashPopIn(repoRoot).pipe(Effect.catchAll(() => Effect.void));
                        return yield* new WorktreeError({
                            reason: "ai-failed-changes-restored",
                            message: `AI suggestion failed: ${error.message}. Your changes have been restored.`,
                        });
                    }),
                ),
            );

            yield* Console.log(`\nSuggested: ${suggestion.name}`);
            yield* Console.log(`Reason: ${suggestion.reasoning}\n`);

            branchName = yield* Prompt.text({
                message: "Branch name:",
                default: suggestion.name,
            });
        }

        // Sanitize and create worktree
        const dirName = sanitizeBranchName(branchName);
        const worktreePath = `${worktreesDir}/${dirName}`;

        yield* git.worktreeAdd(worktreePath, branchName).pipe(
            Effect.mapError(
                () =>
                    new WorktreeError({
                        reason: "worktree-create-failed",
                        message: `Failed to create worktree at ${worktreePath}`,
                    }),
            ),
        );

        // If dirty, pop stash into the new worktree
        if (!isClean) {
            yield* git.stashPopIn(worktreePath).pipe(
                Effect.mapError(
                    () =>
                        new WorktreeError({
                            reason: "stash-pop-failed",
                            message: `Worktree created at ${worktreePath} but stash pop failed. Run 'git -C ${worktreePath} stash pop' manually to resolve.`,
                        }),
                ),
            );
        }

        yield* Console.log(`\nWorktree created at ${worktreePath} on branch ${branchName}`);
    }).pipe(
        Effect.catchTag("WorktreeError", (error) => Console.error(error.message)),
        Effect.catchTag("OgitAiError", (error) => Console.error(`AI error: ${error.message}`)),
        Effect.catchTag("GitError", (error) => Console.error(error.message)),
        Effect.catchTag("ConfigSetupError", (error) => {
            if (error.reason === "missing_api_key") {
                return Console.error(
                    "Missing API key. Set it using one of:\n" +
                        '  - Environment variable: export OGIT_API_KEY="your-key"\n' +
                        `  - Global config: add api-key "your-key" to ${error.globalConfigPath}\n` +
                        '  - Local config: add api-key "your-key" to .ogit.kdl in your repo',
                );
            }
            return Console.error(`Configuration error: ${error.message}`);
        }),
    ),
).pipe(Command.withDescription("Create a new worktree with a branch"));

export const worktree = Command.make("worktree").pipe(
    Command.withDescription("Manage git worktrees"),
    Command.withSubcommands([create]),
);
```

- [ ] **Step 2: Update `src/main.ts`**

Add import and register the worktree command:

```typescript
import { worktree } from "./commands/worktree.ts";
```

Update the subcommands:

```typescript
Command.withSubcommands([commit, worktree]),
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/commands/worktree.ts src/main.ts
ogit commit -n
```

---

### Task 7: Manual end-to-end testing

- [ ] **Step 1: Build the project**

```bash
pnpm build
```

- [ ] **Step 2: Test clean path**

In a clean repo state:

```bash
ogit worktree create
```

Enter a branch name like `feat/test-clean`. Verify:
- `.worktrees/` directory created
- `.worktrees` entry in `.gitignore`
- Worktree at `.worktrees/feat-test-clean`
- Branch `feat/test-clean` exists

- [ ] **Step 3: Test dirty path**

Make some changes (create/edit a file), then:

```bash
ogit worktree create
```

Verify:
- AI suggests a branch name with reasoning
- User can accept or edit
- Worktree created
- Changes appear in the new worktree (not in original)

- [ ] **Step 4: Clean up test worktrees**

```bash
git worktree remove .worktrees/feat-test-clean
git branch -D feat/test-clean
# repeat for dirty-path test worktree
```

- [ ] **Step 5: Commit any fixes discovered during testing**
