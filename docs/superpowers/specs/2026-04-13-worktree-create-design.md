# ogit worktree create — Design Spec

## Overview

Add an `ogit worktree create` command that creates a git worktree and branch from the current repo. When the working tree is dirty, changes are stashed, analyzed by AI to suggest a branch name, and then moved into the new worktree.

## Service Rename: CommitAi → OgitAi

Rename `src/services/CommitAi.ts` to `src/services/OgitAi.ts`. Rename the service class/tag from `CommitAi` to `OgitAi`. Update all import sites (`src/commands/commit.ts`, `src/main.ts`).

All existing methods remain unchanged:

- `createChat(context, systemPrompt?)` — returns a `Chat.Service` for commit message generation
- `triageFiles(files, branch)` — classifies files as analyse/skip
- `analyseFiles(diff, branch)` — groups changes by relevance

New method:

- `suggestBranchName(diff: string)` — sends diff to Claude, returns a `BranchNameSuggestion`

## Git Service Extensions

New methods on `src/services/Git.ts`:

| Method                      | Git command                           | Purpose                                                                                    |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `stash()`                   | `git stash --include-untracked`       | Stash all changes including untracked files                                                |
| `stashPopIn(cwd)`           | `git -C <cwd> stash pop`              | Pop stash in a specific worktree directory                                                 |
| `worktreeAdd(path, branch)` | `git worktree add -b <branch> <path>` | Create worktree with new branch                                                            |
| `diffAll()`                 | `git diff HEAD`                       | All changes (staged + unstaged) vs HEAD — requires `intentToAdd` for untracked files first |
| `repoRoot()`                | `git rev-parse --show-toplevel`       | Resolve repo root for `.worktrees/` path                                                   |

Note: `stashPopIn` uses `git -C` to set the working directory, so the popped changes land in the correct worktree. The existing `run()` helper spawns in the inherited cwd; `git -C` avoids needing to change the spawner.

## Command: `ogit worktree create`

New file: `src/commands/worktree.ts`

### Registration

Parent command `worktree` with subcommand `create`. Registered in `main.ts`:

```typescript
Command.withSubcommands([commit, worktree]);
```

### Flow

1. Get repo root via `Git.repoRoot()`
2. Ensure `<root>/.worktrees/` directory exists (create if not)
3. Ensure `.worktrees` entry exists in `<root>/.gitignore` (append `/.worktrees` on its own line if not present; match against `/.worktrees` and `.worktrees` patterns)
4. Check `git status` — determine if working tree is clean

#### Clean path

1. Prompt user for branch name via `Prompt.text()`
2. Sanitize to directory name (see Sanitization below)
3. Create worktree at `<root>/.worktrees/<sanitized-name>` with branch name as entered

#### Dirty path

1. Parse `git status` to identify untracked files
2. Run `intentToAdd(untrackedFiles)` so untracked files are visible to diff
3. Run `diffAll()` (`git diff HEAD`) to capture the full changeset (staged + unstaged + newly tracked)
4. Run `resetFiles(untrackedFiles)` to undo the intent-to-add
5. Stash everything via `git stash --include-untracked`
6. Send diff to `OgitAi.suggestBranchName()` — returns `BranchNameSuggestion` with `name` and `reasoning`
7. Display reasoning to user
8. Present suggestion via `Prompt.text()` with AI suggestion as default — user can accept (Enter) or edit
9. Sanitize name → create worktree
10. Run `stashPopIn(worktreePath)` to pop changes into the new worktree

**Recovery on AI failure:** If `suggestBranchName` fails after stashing (network error, API error), automatically run `git stash pop` to restore the user's changes and surface the error. The user loses nothing.

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
- `ai-failed-changes-restored` — AI suggestion failed, stash was automatically popped to restore changes

If `stash pop` fails (e.g. merge conflict), the worktree still exists and the stash is preserved. The error is surfaced to the user to resolve manually — no auto-recovery.

If AI fails post-stash, the stash is automatically popped to restore changes, and the error explains what happened.

## Future Work

- `ogit worktree remove` — clean up worktrees
- Flags (e.g. `--name`/`-n`) to skip interactive prompt
