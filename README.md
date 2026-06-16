<<<<<<< HEAD
# Ritual — Daily Habit Coach

## Run locally

1. Copy `.env.example` to `.env` and add your API key.
2. Export the variables in your terminal:

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_MODEL="gpt-4.1-mini"
node server.mjs
```

3. Open http://localhost:3000.

The API key stays on the server. If no key is configured, the app uses local demo replies so the interface remains usable.

The current backend also stores habits and conversation state in `data/state.json`. This is a single-user development store; authentication and a real multi-user database are the next production steps.

## Accounts

The app now includes local email/password accounts. Passwords are hashed with Node's `scrypt`, sessions use an HTTP-only cookie, and each account gets a separate `data/user-<id>.json` file. This is suitable for local development; production should move users, sessions, and state to a managed database with HTTPS and a dedicated identity provider.

## Vercel + Supabase deployment

The `api/` directory contains Vercel Functions for authentication, state, and LLM chat. The `supabase/schema.sql` file creates the user state table and RLS policies. Run that SQL in Supabase, then add `OPENAI_API_KEY`, `OPENAI_MODEL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` as Vercel environment variables before deploying this directory.
=======
# My-code
>>>>>>> 4e59b405e19cca450f616ef15f1448d098a41f5d
