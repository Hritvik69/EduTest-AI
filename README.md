# EduTest.AI

AI-powered CBSE/NCERT test-paper generation, PDF-based paper creation, local validation, AI-assisted evaluation, and PDF export.

## Features

- Guest-first test paper generation
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

For real NCERT_Books-backed normal mode, import the local `NCERT_Books`
folder into Neon after migrations. Text-only import uses the PDF text itself
and does not spend AI tokens:

```bash
npm run import:ncert -- --text-only --class=8 --subject=English --chapter="The Wit that Won Hearts"
```

For a full import, omit the class/subject/chapter filters:

```bash
npm run import:ncert -- --text-only
```

Vercel cannot read your local ignored `NCERT_Books` folder at runtime, so
production uses the imported Neon concepts. Local development uses Neon first,
then the local `NCERT_Books` folder, then static fallback data.

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

### Production AI provider recovery

For reliable Auto Fallback in Vercel Production, configure at least two funded
question-generation providers:

- Required primary: `GEMINI_API_KEY`
- Recommended backup: one or more of `GROQ_API_KEY`, `MISTRAL_API_KEY`,
  `GITHUB_MODELS_TOKEN`, or `OPENROUTER_API_KEY`
- Optional providers to fix or remove until funded: `CEREBRAS_API_KEY`,
  `COHERE_API_KEY`, `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`,
  `XAI_API_KEY`, `DEEPSEEK_API_KEY`, and `OPENAI_API_KEY`

After deploy, open `/api/ai/provider-health` in production. Large paper runs
should show at least two usable providers before generation starts. If all
providers are unavailable, the app can continue from selected NCERT/PDF source
text when enough imported source text exists.

## Security Notes

- Do not commit `.env.local` or real API keys.
- Rotate any key that was exposed in a terminal, screenshot, or chat.
- Keep `SUPABASE_SERVICE_KEY` server-only.
- The app runs in guest mode. Do not set Google login variables unless the
  authentication flow is intentionally rebuilt later.
