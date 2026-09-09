# How we work

Two people, six days, and a hackathon that reads the git history. These rules
exist so the history is legible at the end, not so process feels good in the
middle.

## Nobody commits to `main`

`main` is integration only. Everything arrives through a pull request, both of
us, no exceptions. Branch protection is on, so this is enforced rather than
remembered.

Branch per track, matching the plan:

```
track-a/<thing>    pipeline, contract, agent
track-b/<thing>    frontend and wallet
```

**`<thing>` names what you are working on, not what you did to it.** A branch
is a place to put work, so it should read like a topic you could come back to:

```
track-a/allowance          the contract
track-a/crafter-stages     splitting the pipeline
track-b/recipe-marketplace the view
```

not

```
track-a/allowance-and-the-prize-swap
track-a/llm-deadlines-and-groq
track-b/the-bench-in-the-browser
```

Those are descriptions of a pull request wearing a branch's clothes. They do
not group anything and they are useless to search. Two or three words, a noun
phrase, lowercase with hyphens.

## Titles say what changed

Pull request titles and commit subject lines are the same job: name the change.
Save the reasoning for the body, where there is room for it and where someone
looking for it will actually be looking.

```
Add the Allowance contract
Split crafting into three stages
Fix the preview writing outside the project
```

The body is where "why" lives, and it should — a change nobody can explain is
worse than an ugly title. But a title that reads as a sentence is a title doing
the body's job badly.

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
memory at the end produces a worse and less accurate document.

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
