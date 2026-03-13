-- HNSW vector indexes for fast similarity search
CREATE INDEX IF NOT EXISTS notes_embedding_idx ON notes USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS note_images_embedding_idx ON note_images USING hnsw (embedding vector_cosine_ops);

-- GIN full-text search index
CREATE INDEX IF NOT EXISTS notes_fts_idx ON notes USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));
