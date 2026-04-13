# ogit worktree create — Design Spec

## Overview

Add an `ogit worktree create` command that creates a git worktree and branch from the current repo. When the working tree is dirty, changes are stashed, analyzed by AI to suggest a branch name, and then moved into the new worktree.

## Service Rename: CommitAi → OgitAi

Rename `src/services/CommitAi.ts` to `src/services/OgitAi.ts`. Rename the service class/tag from `CommitAi` to `OgitAi`. Update all import sites (`src/commands/commit.ts`, `src/main.ts`).

All existing methods remain unchanged:
- `triageFiles(files, branch)`
- `analyseFiles(diff, branch)`
- `generateCommitMessage(diff, context)`
- `regenerateCommitMessage(diff, context, feedback)`

New method:
- `suggestBranchName(diff: string)` — sends diff to Claude, returns a `BranchNameSuggestion`

## Git Service Extensions

New methods on `src/services/Git.ts`:

| Method | Git command | Purpose |
|---|---|---|
| `stash()` | `git stash --include-untracked` | Stash all changes including untracked files |
| `stashPop()` | `git stash pop` | Pop stash into current worktree |
| `worktreeAdd(path, branch)` | `git worktree add -b <branch> <path>` | Create worktree with new branch |
| `diff()` | `git diff` | Get unstaged changes (for dirty-state analysis) |
| `repoRoot()` | `git rev-parse --show-toplevel` | Resolve repo root for `.worktrees/` path |

## Command: `ogit worktree create`

New file: `src/commands/worktree.ts`

### Registration

Parent command `worktree` with subcommand `create`. Registered in `main.ts`:

```typescript
Command.withSubcommands([commit, worktree])
```

### Flow

1. Get repo root via `Git.repoRoot()`
2. Ensure `<root>/.worktrees/` directory exists (create if not)
3. Ensure `.worktrees` is listed in `<root>/.gitignore` (append if missing)
4. Check `git status` — determine if working tree is clean

#### Clean path

1. Prompt user for branch name via `Prompt.text()`
2. Sanitize to directory name (see Sanitization below)
3. Create worktree at `<root>/.worktrees/<sanitized-name>` with branch name as entered

#### Dirty path

1. Run `git diff` (plus `git diff --staged` for any staged changes) to capture full changeset
2. Stash everything via `git stash --include-untracked`
3. Send diff to `OgitAi.suggestBranchName()` — returns `BranchNameSuggestion` with `name` and `reasoning`
4. Display reasoning to user
5. Present suggestion via `Prompt.text()` with AI suggestion as default — user can accept (Enter) or edit
6. Sanitize name → create worktree
7. Run `git stash pop` inside the new worktree directory

### Name Sanitization

Branch name to directory name: replace `/` with `-`, strip characters that aren't alphanumeric, `-`, or `.`.

Example: `feat/new-function` → directory `.worktrees/feat-new-function`, branch `feat/new-function`.

## AI Branch Name Suggestion

### Schema: BranchNameSuggestion

New file or addition to domain schemas:

```typescript
class BranchNameSuggestion extends Schema.Class<BranchNameSuggestion>("BranchNameSuggestion")({
  name: Schema.String,
  reasoning: Schema.String,
}) {}
```

- `name` — suggested branch name, e.g. `feat/add-validation`
- `reasoning` — brief explanation shown to user before the editable prompt

### System Prompt

Instructs Claude to suggest a conventional branch name given a diff. Format: `<type>/<short-description>` where type is one of: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `style`. Description: concise, kebab-case, max ~4 words.

## Error Handling

### WorktreeError

New tagged error class in `src/domain/errors.ts`, following existing patterns:

Reasons:
- `stash-failed` — `git stash` failed
- `worktree-create-failed` — `git worktree add` failed
- `stash-pop-failed` — `git stash pop` failed in the new worktree
- `branch-exists` — branch name already exists

If `stash pop` fails (e.g. merge conflict), the worktree still exists and the stash is preserved. The error is surfaced to the user to resolve manually — no auto-recovery.

## Future Work

- `ogit worktree remove` — clean up worktrees
- Flags (e.g. `--name`/`-n`) to skip interactive prompt
