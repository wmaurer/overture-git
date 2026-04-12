## Committing

Never use `git commit` directly. After staging files with `git add`, always use `ogit commit -n` to create commits. This generates AI-powered commit messages from the staged diff in non-interactive mode.

## Reference Repositories

The `.references/` directory lives in the **main project root** (not in worktrees).
If your working directory is under `.worktrees/`, resolve the project root with:

```bash
git worktree list --porcelain | head -1 | sed 's/^worktree //'
```

Then look for `.references/` there. Always use this when searching reference code.

### Available References

- **`.references/effect`** — Effect v4 (beta) source code. Canonical reference for all Effect patterns.
- **`.references/kdl`** — `@bgotink/kdl` source. KDL document language parser used for config files.
- **`.references/env-paths`** — `env-paths` source. Cross-platform config directory resolution (XDG, macOS, Windows).

<!-- effect-solutions:start -->

## Effect Best Practices

**IMPORTANT:** This project uses Effect v4 (beta). Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `<project-root>/.references/effect` for real v4 implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

**Always reference the Effect v4 source code in `.references/effect`. Never use v3 patterns or APIs — they are incompatible with this project.**

Never guess at Effect patterns - check the guide first.

**Always search `.references/effect` for Effect v4 source code — never `node_modules/effect`.** The `.references/effect` directory contains the canonical v4 beta source. The `node_modules` copy may be stale or incomplete.

<!-- effect-solutions:end -->
