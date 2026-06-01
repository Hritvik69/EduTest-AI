# EduTest.AI

AI-powered CBSE/NCERT test-paper generation, PDF-based paper creation, local validation, AI-assisted evaluation, and PDF export.

## Features

- Guest-first test paper generation
- Optional Google login with NextAuth
- Class, subject, chapter, topic, difficulty, Bloom, and question-type controls
- Uploaded PDF mode with extraction and concept-based generation
- Task-specific AI provider fallback
- Local validation for malformed, duplicate, and incompatible questions
- Local-first answer checking with AI support for subjective answers
- Preview, attempt, result analytics, print, and PDF export

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Neon Postgres
- Supabase Storage
- NextAuth Google provider
- Gemini, Mistral, Cerebras, xAI/Grok, OpenRouter, DeepSeek, and OpenAI provider support

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```env
EDUTEST_AUTH_MODE=guest
DATABASE_URL=your_neon_database_url
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
GEMINI_API_KEY=your_gemini_key
MISTRAL_API_KEY=your_mistral_key
CEREBRAS_API_KEY=your_cerebras_key
XAI_API_KEY=your_xai_key
OPENROUTER_API_KEY=your_openrouter_key
OPENAI_API_KEY=your_openai_key
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Google Login

Guest mode is the default. To enable Google login:

```env
EDUTEST_AUTH_MODE=nextauth
NEXTAUTH_SECRET=your_strong_secret
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

For production, set `NEXTAUTH_URL` to your deployed domain.

## Database Setup

Run the SQL files in Neon in this order:

```text
database/schema.sql
database/20260527_hardening.sql
database/20260528_dynamic_paper_marks.sql
database/20260528_pdf_edu_test.sql
database/20260531_ncert_books_import.sql
database/seed.sql
```

## Supabase Setup

Create a storage bucket:

```text
chapter-pdfs
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run typecheck
npm run lint
npm test
```

## Deployment

Recommended free deployment stack:

- Vercel for Next.js hosting
- Neon Free Postgres
- Supabase Free Storage

Add the same environment variables in Vercel Project Settings before deploying.

## Security Notes

- Do not commit `.env.local` or real API keys.
- Rotate any key that was exposed in a terminal, screenshot, or chat.
- Keep `SUPABASE_SERVICE_KEY` server-only.
- Use `EDUTEST_AUTH_MODE=guest` for guest-only mode or `nextauth` for Google login.

