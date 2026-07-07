# SEA Design Build — CRM

ServOS CRM instance for SEA Design Build.

## Stack

- Vite + React + Tailwind CSS
- Supabase (Postgres + Auth + Realtime)
- Deployed on Vercel

## Local dev

```bash
npm install
cp .env.example .env.local  # fill in your Supabase URL + anon key
npm run dev
```

## Environment variables

See `.env.example`. Three vars total:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL` (used for magic-link redirect)

## Schema

See `supabase/migrations/001_init.sql` for the full schema. Six tables:
profiles, projects, buckets, items, comments, activity. Row-level security is
on for every table; writes gated by role (owner / editor / viewer).

## Auth

Supabase Auth with magic-link email. First user becomes owner. Owner invites
others via the Users panel in the app.
