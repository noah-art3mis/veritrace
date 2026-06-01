<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Working agreement for agents

**Never edit `main` directly, and never make changes straight in the primary working tree for work you intend to land.** Always create a git worktree first (the `EnterWorktree` tool, or `git worktree add`) and do the work there. The primary checkout is for the human's own in-progress work — don't touch it.

Land work through a pull request, not a direct push to `main`. The default flow:

1. Open a tracking issue describing the change (skip only for trivial edits).
2. Create a worktree branched off `origin/main`.
3. Make the change, commit, and push the branch.
4. Open a PR; reference the issue with `Closes #N`.
5. Merge the PR, then remove the worktree and delete the branch.
