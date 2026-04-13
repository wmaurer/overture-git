# Show Prompt Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `--show-prompt` flag to `ogit commit` that prints the default (and any custom) system prompt, then exits.

**Architecture:** Export the existing `DEFAULT_COMMIT_SYSTEM_PROMPT` from `CommitAi.ts`, add a `--show-prompt` boolean flag to the commit command, and insert an early-exit branch in `commit.ts` that loads config, prints prompt(s) to stdout, and returns before any git/AI logic runs.

**Tech Stack:** Effect v4 (CLI, Option, Console), TypeScript

---

### Task 1: Export the default system prompt

**Files:**

- Modify: `src/services/CommitAi.ts:8`

**Step 1: Add `export` to the constant**

Change line 8 from:

```typescript
const DEFAULT_COMMIT_SYSTEM_PROMPT = `You are a git commit message generator...
```

to:

```typescript
export const DEFAULT_COMMIT_SYSTEM_PROMPT = `You are a git commit message generator...
```

**Step 2: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: No errors (exporting a `const` is always backward-compatible)

**Step 3: Commit**

```bash
git add src/services/CommitAi.ts
ogit commit -n
```

---

### Task 2: Add the `--show-prompt` flag and early-exit logic

**Files:**

- Modify: `src/commands/commit.ts:116-265`

**Step 1: Add the flag definition**

In `commit.ts`, inside the `Command.make("commit", { ... })` flags object (lines 117-129), add a new flag after `nonInteractive`:

```typescript
showPrompt: Flag.boolean("show-prompt").pipe(
    Flag.withDefault(false),
    Flag.withDescription("Print the system prompt used for commit message generation and exit"),
),
```

**Step 2: Add the import for the default prompt**

At line 11, update the `CommitAi` import:

```typescript
import { CommitAi, DEFAULT_COMMIT_SYSTEM_PROMPT } from "../services/CommitAi.ts";
```

**Step 3: Add the early-exit branch**

Inside the `Effect.gen` callback (after line 132 where `ogitConfig` is resolved), insert the early-exit logic before the staged-changes check at line 137:

```typescript
// Show prompt and exit if requested
if (config.showPrompt) {
    yield * Console.log("Default system prompt:\n");
    yield * Console.log(DEFAULT_COMMIT_SYSTEM_PROMPT);

    if (Option.isSome(ogitConfig.commitSystemPrompt)) {
        yield * Console.log("\nCustom system prompt (from config):\n");
        yield * Console.log(ogitConfig.commitSystemPrompt.value);
    }

    return;
}
```

Note: `Option` and `Console` are already imported. The `ogitConfig` service is already resolved at line 132.

**Step 4: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/commands/commit.ts
ogit commit -n
```

---

### Task 3: Manual smoke test

**Step 1: Build the project**

Run: `npm run build`
Expected: Clean build

**Step 2: Test `--show-prompt` without a custom config**

Run: `ogit commit --show-prompt`
Expected: Prints "Default system prompt:" followed by the prompt text, then exits cleanly.

**Step 3: Test that normal commit flow is unaffected**

Run: `ogit commit --help`
Expected: `--show-prompt` appears in the help output alongside `--model` and `--non-interactive`.
