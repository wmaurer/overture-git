# Show Prompt Feature Design

## Summary

Add a `--show-prompt` flag to `ogit commit` that prints the system prompt used for commit message generation and exits.

## Behavior

- New boolean flag `--show-prompt` (default `false`) on the commit command
- When set, prints the **default** system prompt to stdout
- If a custom prompt is configured in `.ogit.kdl`, also prints that with a distinguishing label
- Exits immediately — no staged-changes check, no AI call, no commit flow
- Output goes to stdout (pipeable)

## Implementation Touches

1. **`src/services/CommitAi.ts`** — export `DEFAULT_COMMIT_SYSTEM_PROMPT`
2. **`src/commands/commit.ts`** — add `--show-prompt` flag; add early-exit branch before staged-changes logic that reads the config and prints prompt(s)

## Output Format

When no custom prompt is configured:

```
Default system prompt:

<prompt text>
```

When a custom prompt is also configured:

```
Default system prompt:

<default prompt text>

Custom system prompt (from config):

<custom prompt text>
```
