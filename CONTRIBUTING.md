# How we work

Two people, six days, and a hackathon that reads the git history. These rules
exist so the history is legible on Sunday, not so process feels good on Tuesday.

## Nobody commits to `main`

`main` is integration only. Everything arrives through a pull request, both of
us, no exceptions. Branch protection is on, so this is enforced rather than
remembered.

Branch per track, matching the plan:

```
track-a/<what>     pipeline, contract, agent      e.g. track-a/roblox-upload
track-b/<what>     frontend and wallet            e.g. track-b/bench-layout
```

Open the PR early, even while the work is unfinished — it is how the other
person sees what is coming without asking.

Reviews are not required to merge. We are two people against a deadline; the PR
exists for visibility and for the history, not to gate each other. Merge your
own once it works.

## Commit small and often

ETHOnline rules: *"Use version control to track progress; large single commits
or missing histories risk disqualification."*

Take that literally. A commit per working step beats a heroic commit at 2am.
Write what changed and why in the body, not just what.

## No AI attribution in commit messages

The disclosure required by the rules lives in [AI_USAGE.md](AI_USAGE.md), which
is where judges will look for it. Keep it current as you go — writing it from
memory on Saturday produces a worse and less accurate document.

No `Co-Authored-By` trailers, no assistant signatures in commits.

## Never commit a secret

We handle other people's Roblox API keys. That raises the stakes past the usual.

- Keys and private keys go in `.env`, which is gitignored. Never anywhere else.
- Never paste a key into a commit message, a log line, an issue or a PR body.
- If a key does land in a commit, say so immediately and rotate it. Deleting the
  file in a later commit does not remove it from history.

## Before you push

Run the check for what you actually touched. A check nobody can run is worse
than no check, because it gets ignored.

**Touched the site?**

```bash
cd web && npm run build
```

Then `npm run dev` and actually look at it. A passing build only means it
compiles.

**Touched the crafter or a recipe?**

```bash
blender --background --python bench/craft.py -- bench/recipes/market_stall.json out
```

Seven seconds, and it prints a report you can read.

**You do not need Blender to work on the site.** `web/public/samples/` holds a
crafted object, so `npm run dev` shows a populated bench on a fresh clone. Only
install Blender if you are changing what gets crafted.
