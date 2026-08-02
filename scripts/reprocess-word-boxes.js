// Re-runs text extraction over already-uploaded documents and rewrites their page_words rows.
//
// Existing rows were written by an extractor that read the word's x from transform[0] (the font
// size) instead of transform[4], and derived y from the baseline without subtracting the glyph
// height. Both are fixed in extract-pdf-text.js, but stored coordinates keep the old values until
// the source PDFs are run through the corrected code — which is what this script does.
//
// Usage:
//   node scripts/reprocess-word-boxes.js            # report what would change, write nothing
//   node scripts/reprocess-word-boxes.js --apply    # rewrite page_words
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { extractPdfText } from '../services/pdf-service-document/src/extraction/extract-pdf-text.js';
import { normalize } from '../core/service-document/src/domain/text/normalize.js';

const apply = process.argv.includes('--apply');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl });

const reprocessDocument = async (client, doc) => {
  const buffer = await readFile(doc.storage_path);
  const extracted = await extractPdfText(buffer);

  let rewritten = 0;

  for (const page of extracted.pages) {
    const { rows } = await client.query(
      'SELECT id FROM document_pages WHERE document_id = $1 AND page_no = $2',
      [doc.id, page.pageNo],
    );
    if (rows.length === 0) continue;
    const pageId = rows[0].id;

    // Page dimensions come from the same viewport the boxes are relative to, so refresh them too —
    // a stale width/height would misscale every box even with correct coordinates.
    await client.query('UPDATE document_pages SET width = $1, height = $2 WHERE id = $3', [
      page.width,
      page.height,
      pageId,
    ]);

    await client.query('DELETE FROM page_words WHERE page_id = $1', [pageId]);

    if (page.words.length === 0) continue;

    await client.query(
      `INSERT INTO page_words (page_id, text, text_normalized, x, y, w, h, word_index)
       SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::int[])`,
      [
        page.words.map(() => pageId),
        page.words.map((w) => w.text),
        page.words.map((w) => normalize(w.text)),
        page.words.map((w) => w.x),
        page.words.map((w) => w.y),
        page.words.map((w) => w.w),
        page.words.map((w) => w.h),
        page.words.map((w) => w.wordIndex),
      ],
    );

    rewritten += page.words.length;
  }

  return rewritten;
};

const main = async () => {
  // Only documents with a real text layer have extractable word boxes; OCR-ingested ones get their
  // coordinates from the OCR pipeline and must not be overwritten by a text-layer extraction.
  const { rows: docs } = await pool.query(
    `SELECT id, original_name, storage_path FROM documents
     WHERE status = 'ready' AND has_text_layer = true
     ORDER BY created_at`,
  );

  console.log(`${docs.length} document(s) with a text layer.`);
  if (!apply) console.log('Dry run — pass --apply to write.\n');

  let ok = 0;
  let failed = 0;

  for (const doc of docs) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const count = apply
        ? await reprocessDocument(client, doc)
        : (await extractPdfText(await readFile(doc.storage_path))).pages.reduce(
            (n, p) => n + p.words.length,
            0,
          );
      await client.query(apply ? 'COMMIT' : 'ROLLBACK');
      console.log(`  ok   ${doc.original_name} — ${count} word(s)`);
      ok += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      console.log(`  FAIL ${doc.original_name} — ${err.message}`);
      failed += 1;
    } finally {
      client.release();
    }
  }

  console.log(`\n${ok} succeeded, ${failed} failed.`);
  await pool.end();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
