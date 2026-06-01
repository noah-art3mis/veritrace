@AGENTS.md

# Working agreement for agents

**Never edit `main` directly.** Work on a branch and land it through a pull request, never a direct push to `main`.

**Create a worktree only when the primary working tree is already on another branch.** If the human has a non-`main` branch checked out, they're mid-task — make a git worktree (the `EnterWorktree` tool, or `git worktree add`) so you don't disturb their work. If the primary tree is on a clean `main`, skip the worktree: just branch off `main` and work directly in the primary checkout — it's faster and there's nothing to disturb.

The default flow:

1. Open a tracking issue describing the change (skip only for trivial edits).
2. Get on a branch off `origin/main` — a worktree if the primary tree is occupied, otherwise a branch in place.
3. Make the change, commit, and push the branch.
4. Open a PR; reference the issue with `Closes #N`.
5. Merge the PR; if you used a worktree, remove it and delete the branch.
