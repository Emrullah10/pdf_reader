CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    page_count INTEGER,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
    has_text_layer BOOLEAN,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_no INTEGER NOT NULL,
    width NUMERIC NOT NULL,
    height NUMERIC NOT NULL,
    UNIQUE (document_id, page_no)
);

CREATE TABLE IF NOT EXISTS page_words (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES document_pages(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    text_normalized TEXT NOT NULL,
    x NUMERIC NOT NULL,
    y NUMERIC NOT NULL,
    w NUMERIC NOT NULL,
    h NUMERIC NOT NULL,
    word_index INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_document_pages_document_id ON document_pages(document_id);
CREATE INDEX IF NOT EXISTS idx_page_words_page_id ON page_words(page_id);
CREATE INDEX IF NOT EXISTS idx_page_words_text_normalized ON page_words(text_normalized);

-- Persistent extraction queue: one row per document upload. Lets extraction run in a separate
-- worker process (isolated from the API's memory/CPU budget) and survive a worker restart —
-- a queued/running job is picked back up rather than silently leaving the document stuck in
-- 'processing' forever.
CREATE TABLE IF NOT EXISTS document_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    pages_done INTEGER NOT NULL DEFAULT 0,
    page_count INTEGER,
    error_message TEXT,
    locked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_jobs_status ON document_jobs(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_jobs_document ON document_jobs(document_id);
