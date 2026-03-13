# Continuum Notes

An AI-powered note-taking app that automatically enriches your notes with semantic embeddings, related content discovery, web search results, and a visual knowledge graph — all running as background jobs the moment you save.
---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Tech Stack and Why](#tech-stack-and-why)
- [Architecture Overview](#architecture-overview)
- [How Related Content Works](#how-related-content-works)
- [How to Run Locally](#how-to-run-locally)
- [Database Setup](#database-setup)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)

---

## Features

- **Rich text editor** — Tiptap-based editor with formatting, headings, lists, and inline images
- **AI enrichment pipeline** — Every note is automatically classified, tagged, embedded, and linked to related notes via background jobs
- **Semantic + full-text search** — Hybrid search combining PostgreSQL full-text search with pgvector cosine similarity
- **Image search** — Upload images, get AI-generated descriptions, and search notes by visual content
- **Related notes** — Hybrid ranking (vector similarity + keyword matching + LLM reranking) discovers connections between your notes
- **Web search integration** — Non-personal notes automatically get relevant articles, videos, and resources from the web
- **Knowledge graph** — Interactive force-directed graph showing how all your notes relate to each other
- **Note sharing** — Generate public links for any note with one click
- **Dark mode** — Full dark theme out of the box

---

## Screenshots

> Replace these placeholders with actual screenshots from the running app.

| View | Screenshot |
|------|-----------|
| Notes List | ![Notes List](screenshots/notes-list.png) |
| Knowledge Graph | ![Knowledge Graph](screenshots/knowledge-graph.png) |
| webresults | ![webresults](screenshots/web_results.png) |
| Login | ![Login](screenshots/login.png) |


---

## Tech Stack and Why

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | Next.js 16 (App Router) | Server components, API routes, and middleware in one codebase. The App Router's layout system keeps auth and dashboard concerns cleanly separated. |
| **Language** | TypeScript | End-to-end type safety from database schema to API responses to React props. |
| **Database** | PostgreSQL (Neon) | Needed vector search (pgvector), full-text search (tsvector/GIN), and relational joins — Postgres does all three natively without bolting on a separate vector DB. |
| **ORM** | Drizzle | Type-safe schema definitions that double as the source of truth, plus first-class support for raw SQL when needed (vector queries, FTS). Lightweight compared to Prisma. |
| **Vector Search** | pgvector (HNSW) | Cosine similarity search on 1536-dim OpenAI embeddings, indexed with HNSW for sub-linear lookup. Lives in the same DB as the rest of the data — no extra infrastructure. |
| **Auth** | NextAuth v5 (credentials) | JWT-based sessions with middleware protection. Simple email/password flow, extensible to OAuth later. |
| **AI** | OpenAI API (gpt-5-mini) | Powers classification, tag extraction, title generation, image description, and related-note reranking — all in a single LLM call per enrichment. Falls back to local Transformers.js for embeddings when no API key is set. |
| **Background Jobs** | Inngest | Event-driven step functions with built-in retries and observability. The enrichment pipeline runs as a multi-step Inngest function triggered on note creation/update. |
| **Web Search** | Tavily API | Structured search results with titles, descriptions, and thumbnails — cleaner than scraping. |
| **File Storage** | Vercel Blob | Zero-config image uploads with CDN delivery. |
| **UI** | shadcn/ui + Tailwind CSS v4 | Composable, accessible components that you own (not a dependency). Tailwind for rapid styling with dark mode via CSS variables. |
| **Editor** | Tiptap (ProseMirror) | Production-grade rich text with a React-friendly API. Supports images, placeholder text, and outputs both JSON (for rendering) and plain text (for search/embeddings). |
| **Data Fetching** | SWR | Client-side caching, deduplication, optimistic updates, and polling — all declarative. Powers the real-time enrichment status polling. |
| **Graph** | react-force-graph-2d | Canvas-based force-directed layout that handles hundreds of nodes smoothly. |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          NEXT.JS APP                                │
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Pages &  │  │   API Routes │  │  Middleware   │  │    SWR     │ │
│  │Components │◄─┤  /api/notes  │  │  (JWT auth)  │  │  (cache +  │ │
│  │  (React)  │  │  /api/images │  │              │  │  optimistic│ │
│  └──────────┘  └──────┬───────┘  └──────────────┘  │  updates)  │ │
│                       │                              └────────────┘ │
└───────────────────────┼─────────────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────────┐
          │             │                 │
          ▼             ▼                 ▼
   ┌─────────────┐ ┌────────┐    ┌──────────────┐
   │  PostgreSQL  │ │Inngest │    │ Vercel Blob  │
   │   (Neon)     │ │  (BG   │    │  (images)    │
   │             │ │  Jobs)  │    └──────────────┘
   │ ┌─────────┐ │ └───┬────┘
   │ │ pgvector│ │     │
   │ │ (HNSW)  │ │     │  Enrichment pipeline:
   │ └─────────┘ │     │
   │ ┌─────────┐ │     ├──► Generate embedding (OpenAI / Transformers.js)
   │ │  GIN    │ │     ├──► Classify note + extract tags (single LLM call)
   │ │  (FTS)  │ │     ├──► Find related notes (vector + keyword + LLM rerank)
   │ └─────────┘ │     ├──► Web search via Tavily (non-personal notes only)
   └─────────────┘     └──► Store results back to PostgreSQL
```

**Request flow for creating a note:**

1. User writes in Tiptap editor → auto-saves after 1.5s of inactivity
2. `POST /api/notes` validates, generates a title if missing (LLM), inserts row
3. Fires `notes/enrich` event to Inngest
4. Inngest runs the enrichment pipeline as background steps (with retries)
5. Frontend polls `/api/notes/{id}/related` every 4s until `enrichmentStatus = "completed"`
6. Related notes, web content, and tags appear in the UI without a page refresh

---

## How Related Content Works

This is the core of the app — here's exactly how related content is fetched, stored, and invalidated.

### Fetching (Enrichment Pipeline)

When a note is created or updated, Inngest runs a multi-step background function:

```
1. generate-embedding
   └─ OpenAI text-embedding-3-small (1536 dims) or Transformers.js fallback

2. find-candidates
   ├─ Vector search: top 20 notes by cosine similarity (pgvector HNSW index)
   └─ Keyword search: top 20 notes by ts_rank_cd (GIN full-text index)

3. analyze-note (single LLM call)
   ├─ Classifies note as personal vs. non-personal
   ├─ Extracts 2-4 topic tags
   ├─ Reranks candidate notes by conceptual relevance
   └─ Generates 1-3 web search queries (if non-personal)

4. store-related-notes
   ├─ Hybrid score = vector_similarity × 0.6 + keyword_rank × 0.4 + llm_boost
   ├─ Filter: combined score ≥ 0.3
   ├─ Keep top 5
   └─ Insert bidirectionally (A→B and B→A) with ON CONFLICT UPDATE

5. web-search (if retrieval_enabled)
   ├─ Run all queries in parallel via Tavily API
   ├─ Deduplicate by URL
   └─ Store first unique result per query
```

### Storage

```sql
-- Related notes: bidirectional links with similarity scores
related_notes (source_note_id, related_note_id, similarity_score)
  UNIQUE(source_note_id, related_note_id)  -- prevents duplicates
  INDEX on source_note_id                   -- fast lookup by note
  INDEX on related_note_id                  -- fast reverse lookup

-- Web content: articles/videos linked to notes
related_web_content (note_id, url, title, description, thumbnail_url, content_type, relevance_reason)
  UNIQUE(note_id, url)                     -- one entry per URL per note
```

### Invalidation

- **On note update:** A new `notes/enrich` event fires, which **deletes all existing related notes and web content** for that note, then recomputes everything from scratch. This ensures stale relationships don't persist after content changes.
- **Bidirectional cleanup:** When note A gets re-enriched, its forward links (A→X) are deleted and recreated. Reverse links (X→A) from other notes remain until those notes are re-enriched.
- **Cascade deletes:** When a note is deleted, all `related_notes` and `related_web_content` rows referencing it are cascade-deleted via foreign keys.
- **Frontend polling:** The UI polls the related content endpoint every 4 seconds while `enrichmentStatus` is `"processing"` or `"pending"`, and stops once it reaches `"completed"`. SWR handles deduplication so multiple components don't create duplicate requests.

---

## How to Run Locally

### Prerequisites

- **Node.js** 18+
- **PostgreSQL** with the [pgvector extension](https://github.com/pgvector/pgvector) enabled
  - Easiest option: create a free [Neon](https://neon.tech) database (pgvector is pre-installed)
- **Inngest CLI** (for background jobs in development)

### 1. Clone and install

```bash
git clone <your-repo-url> continuum-notes
cd continuum-notes
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
# Then fill in the values — see "Environment Variables" section below
```

### 3. Set up the database

```bash
# Push the Drizzle schema to your database
npx drizzle-kit push

# Create performance indexes (vector search + full-text search)
# Run this SQL against your database (e.g., via psql or Neon console):
psql $DATABASE_URL -f scripts/create-indexes.sql
```

### 4. Start the Inngest dev server

```bash
# In a separate terminal
npx inngest-cli@latest dev
```

### 5. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — sign up with any email/password to get started.

### Quick verification checklist

- [ ] Sign up and log in
- [ ] Create a note with some content about a topic (e.g., "How does KV caching work in transformers?")
- [ ] Check the Inngest dashboard at [http://localhost:8288](http://localhost:8288) — you should see the enrichment function running
- [ ] After enrichment completes, the note detail page should show related notes, tags, and web results
- [ ] Try searching — both text and semantic search should return results
- [ ] Open the knowledge graph view — notes should appear as connected nodes

---

## Database Setup

### Required: pgvector extension

If you're using Neon, pgvector is already enabled. For self-hosted PostgreSQL:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Schema push

```bash
npx drizzle-kit push
```

### Performance indexes

After pushing the schema, run the index creation script:

```sql
-- HNSW vector indexes (fast cosine similarity search)
CREATE INDEX IF NOT EXISTS notes_embedding_idx ON notes USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS note_images_embedding_idx ON note_images USING hnsw (embedding vector_cosine_ops);

-- GIN full-text search index
CREATE INDEX IF NOT EXISTS notes_fts_idx ON notes USING GIN (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
);
```

These indexes make a significant difference — vector search goes from sequential scan to sub-linear HNSW lookup, and full-text search uses the GIN index instead of recomputing tsvectors per row.

---

## Deployment

### Vercel (recommended)

1. Push your repo to GitHub
2. Import it on [Vercel](https://vercel.com/new)
3. Add all environment variables in the Vercel dashboard
4. Set up a Neon PostgreSQL database and connect it
5. Run `npx drizzle-kit push` against the production database
6. Run the `scripts/create-indexes.sql` against production
7. Set up [Inngest on Vercel](https://www.inngest.com/docs/deploy/vercel) for background jobs

<!-- Replace with your actual deployed URL -->
**Deployed app:** [https://your-app.vercel.app](https://your-app.vercel.app)

---

## Environment Variables

Create a `.env.local` file in the project root:

```bash
# ── Required ──────────────────────────────────────────
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET=""              # Generate with: openssl rand -base64 32

# ── Required for AI features ──────────────────────────
OPENAI_API_KEY=""               # Powers embeddings, classification, tags, image descriptions
                                # Without this, app falls back to local Transformers.js for
                                # embeddings only — classification/tags/image descriptions are skipped

# ── Required for background jobs ──────────────────────
INNGEST_EVENT_KEY=""            # From your Inngest dashboard
INNGEST_SIGNING_KEY=""          # From your Inngest dashboard

# ── Required for image uploads ────────────────────────
BLOB_READ_WRITE_TOKEN=""        # From Vercel Blob storage

# ── Optional ──────────────────────────────────────────
TAVILY_API_KEY=""               # Enables web search for non-personal notes
                                # Without this, web search is silently skipped
```

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/                     # Login and signup pages
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/                # Authenticated pages
│   │   ├── layout.tsx              # Sidebar + dashboard chrome
│   │   └── notes/
│   │       ├── page.tsx            # Notes list + graph toggle
│   │       ├── new/page.tsx        # Create note
│   │       ├── [id]/page.tsx       # Note detail + related content
│   │       └── [id]/edit/page.tsx  # Rich text editor
│   ├── api/
│   │   ├── notes/                  # CRUD, search, related, share, graph
│   │   ├── images/                 # Upload + delete
│   │   └── inngest/route.ts        # Inngest webhook handler
│   └── share/[token]/page.tsx      # Public shared note view
│
├── components/
│   ├── notes/
│   │   ├── NoteEditor.tsx          # Tiptap rich text editor
│   │   ├── NoteList.tsx            # Paginated note grid
│   │   ├── NoteCard.tsx            # Individual note card (React.memo)
│   │   ├── NoteGraph.tsx           # Force-directed knowledge graph
│   │   ├── NoteSearch.tsx          # Hybrid search UI
│   │   ├── RelatedContent.tsx      # Related notes + web results panel
│   │   └── ShareDialog.tsx         # Share link dialog
│   ├── layout/AppSidebar.tsx       # Navigation sidebar
│   └── ui/                         # shadcn/ui primitives
│
├── hooks/
│   └── use-notes.ts                # SWR hooks + API helpers for notes
│
├── lib/
│   ├── db/
│   │   ├── schema.ts               # Drizzle schema (notes, related, images, web content)
│   │   └── index.ts                # Neon database client
│   ├── inngest/
│   │   ├── client.ts               # Inngest client
│   │   └── functions.ts            # Enrichment pipeline (the big one)
│   ├── openai.ts                   # Singleton OpenAI client
│   ├── embeddings.ts               # OpenAI or Transformers.js embeddings
│   ├── classify.ts                 # LLM classification + tags + reranking
│   ├── search.ts                   # Tavily web search
│   ├── relevance.ts                # Relevance scoring
│   ├── title.ts                    # Auto title generation
│   ├── images.ts                   # Image description via vision API
│   └── auth.ts                     # NextAuth configuration
│
├── middleware.ts                    # Auth protection for /notes/* routes
└── scripts/
    └── create-indexes.sql           # HNSW + GIN index creation
```
