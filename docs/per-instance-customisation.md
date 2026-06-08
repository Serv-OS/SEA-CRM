# Customising per instance

The model: **one canonical core, one customisable copy per customer.** Each
customer can have any code changes they need — different screens, workflows,
entities, whatever. You are NOT trying to build one system that fits everyone.
The only discipline is keeping a path for core bug fixes to flow into every copy.

## Recommended: branch per customer

Keep everything in this one repo.

- `main` = the canonical core / template. **Never deploy `main` to a customer.**
  It's the thing you branch from and the place core fixes land.
- `instance/<customer>` = one long-lived branch per customer, with their bespoke changes.

### Start a new customer
```sh
git checkout main && git pull
git checkout -b instance/acme        # acme = the customer
# provision their infra:
./scripts/bootstrap-instance.sh      # migrations + functions to their Supabase
# then make any bespoke code changes on this branch and commit
git push -u origin instance/acme
```
Point that customer's **Vercel project at the `instance/acme` branch** (Vercel →
Project → Settings → Git → Production Branch). Each customer = its own Vercel +
Supabase + Google Cloud project, all fed from its own branch.

### Ship a core fix to everyone
Fix it once on `main`, then merge into each live instance:
```sh
git checkout main && git commit -m "fix: ..." && git push
git checkout instance/acme && git merge main && git push
git checkout instance/bistro && git merge main && git push
```
With 2–5 customers this is a couple of minutes. (If a fix is risky, cherry-pick
the specific commit instead: `git cherry-pick <sha>`.)

## Keeping merges painless

The only thing that makes branch-per-customer annoying is merge conflicts. Reduce
them by **localising bespoke changes**:

- Put a customer's custom screens/components in their own files (e.g.
  `src/components/custom/acme/…`) and wire them in with a small edit, rather than
  rewriting shared components inline.
- Prefer adding a new file over heavily editing a core one.
- Anything that's genuinely just config (labels, colours, which modules show)
  should still go through **Settings** — that's per-instance data in their DB and
  needs no code change at all.

The more a customer's difference lives in its own files (or in Settings), the
cleaner `git merge main` stays.

## Alternative: separate repo per customer

If you'd rather have hard isolation than branches in one repo:
```sh
# one-time, per customer: copy the template into a new repo, keep a link back
git clone <template-repo> acme && cd acme
git remote add upstream <template-repo>
# pull core fixes when you want them:
git fetch upstream && git merge upstream/main
```
Same merge cost as branches, stronger isolation, more repos to track. Use this
only if a customer's code diverges so far that merging from `main` stops being
useful — at which point that instance is effectively its own product.

## What's already in place to make each clone fast
- `scripts/bootstrap-instance.sh` — migrations + all edge functions to a fresh project
- `docs/setup-new-customer.md` — the infra checklist (Supabase / Vercel / Google)
- Branding, colours, logos, and most config are per-instance **Settings** (no code)
- `VITE_GOOGLE_CLIENT_ID` + Supabase env vars point each instance at its own services

So a new customer = branch from `main` → run bootstrap → set env vars → make any
bespoke edits on the branch → deploy. Core fixes merge in whenever you want them.
