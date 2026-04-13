# Auto-staging for commit command

## Problem

The commit command currently requires files to be staged manually. When nothing is staged, it should intelligently stage files — analysing them to determine if they all belong in the same commit.

## Design: Two-phase AI analysis

### Flow

#### Interactive mode (default)

```
diffStaged()
  |-- has staged changes --> existing flow (unchanged)
  |-- nothing staged:
        1. git status --porcelain --> file list
        2. AI triage (file names only) --> classify each as analyse/skip
        3. Filter out binaries from "analyse" files (git diff --numstat)
        4. git add -N <analyse files> --> intent-to-add
        5. git diff <analyse files> --> get diffs
        6. git reset <analyse files> --> remove intent-to-add
        7. AI analysis (diffs) --> relevant / irrelevant grouping
        8. All relevant --> stage all analyse files
           Some irrelevant --> prompt user "Exclude these? (y/n)"
             |-- yes --> stage only relevant files
             |-- no --> stage all analyse files
        9. Existing flow: diffStaged --> generate message --> action loop --> commit
```

#### Non-interactive mode (-n)

```
diffStaged()
  |-- has staged changes --> existing flow (unchanged)
  |-- nothing staged:
        1. git add -A (stage everything)
        2. Existing flow: diffStaged --> generate message --> commit
```

### AI triage (phase 1)

Input: file list (names only, from git status).
Output: classification of each file as `analyse` or `skip`.

Purpose: avoid sending large/useless content (logs, output files, binaries, generated artifacts) to the AI. The AI decides based on filenames and context — no brittle heuristic.

### AI analysis (phase 2)

Input: diffs for the non-binary `analyse` files.
Output: structured grouping — which files are relevant to the main change and which seem unrelated.

```typescript
class FileAnalysis {
    allRelevant: boolean;
    relevant: string[]; // file paths
    irrelevant: Array<{
        path: string;
        reason: string; // brief explanation
    }>;
}
```

### User interaction (irrelevant files found)

```
These files seem unrelated to the main changes:
  - vitest.config.ts (configuration change, unrelated to feature work)
  - .gitignore (housekeeping change)

Exclude them from this commit? (y/n)
```

Simple yes/no — not per-file. For finer control, the user can `git add` manually.

## New components

| Component                 | Location                  | Purpose                                      |
| ------------------------- | ------------------------- | -------------------------------------------- |
| `FileTriage` schema       | `domain/CommitMessage.ts` | AI response for file classification          |
| `FileAnalysis` schema     | `domain/CommitMessage.ts` | AI response for relevance grouping           |
| `CommitAi.triageFiles()`  | `services/CommitAi.ts`    | File list --> analyse/skip classification    |
| `CommitAi.analyseFiles()` | `services/CommitAi.ts`    | Diffs --> relevant/irrelevant grouping       |
| `Git.diffFiles()`         | `services/Git.ts`         | Diff specific files (including untracked)    |
| `Git.addFiles()`          | `services/Git.ts`         | Stage specific file paths                    |
| `Git.addAll()`            | `services/Git.ts`         | Stage everything (for non-interactive)       |
| `autoStage()`             | `commands/commit.ts`      | Orchestrates triage --> analysis --> staging |

## What stays unchanged

- Commit message generation (CommitAi.createChat)
- Action loop (commit/edit/regenerate/cancel)
- Editor integration
- Error handling pattern
