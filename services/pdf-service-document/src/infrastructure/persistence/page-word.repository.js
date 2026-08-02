// KNOWN GAP: writes here are not wrapped in a transaction with the parent document's
// status update. If a later page's write fails mid-upload, earlier pages' rows can be
// left orphaned under a document marked status='failed'. See core/service-document's
// upload-document.use-case.js for the calling context. Fixing this requires either a
// transaction-aware repository wrapper injected into the use-case layer, or a cleanup
// step (DELETE FROM document_pages WHERE document_id = ...) in the use-case's catch
// block — deferred as a follow-up, not blocking for this phase.

const rowToWord = (row) => ({
  id: row.id,
  pageId: row.page_id,
  text: row.text,
  textNormalized: row.text_normalized,
  x: Number(row.x),
  y: Number(row.y),
  w: Number(row.w),
  h: Number(row.h),
  wordIndex: row.word_index,
});

export const makePageWordRepository = ({ pool }) => ({
  async createMany(pageId, words) {
    if (words.length === 0) return [];

    const { rows } = await pool.query(
      `INSERT INTO page_words (page_id, text, text_normalized, x, y, w, h, word_index)
       SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::int[])
       RETURNING *`,
      [
        words.map(() => pageId),
        words.map((w) => w.text),
        words.map((w) => w.textNormalized),
        words.map((w) => w.x),
        words.map((w) => w.y),
        words.map((w) => w.w),
        words.map((w) => w.h),
        words.map((w) => w.wordIndex),
      ],
    );
    return rows.map(rowToWord);
  },

  async searchByUser(userId, { normalizedQuery, documentIds = [] }) {
    const params = [userId, normalizedQuery];
    let documentFilter = '';
    if (documentIds.length > 0) {
      params.push(documentIds);
      documentFilter = `AND d.id = ANY($${params.length}::uuid[])`;
    }

    const { rows } = await pool.query(
      `SELECT pw.text, pw.x, pw.y, pw.w, pw.h, dp.page_no, d.id AS document_id
       FROM page_words pw
       JOIN document_pages dp ON dp.id = pw.page_id
       JOIN documents d ON d.id = dp.document_id
       WHERE d.user_id = $1 AND pw.text_normalized = $2 ${documentFilter}
       ORDER BY d.id, dp.page_no, pw.word_index`,
      params,
    );

    return rows.map((row) => ({
      documentId: row.document_id,
      pageNo: row.page_no,
      text: row.text,
      x: Number(row.x),
      y: Number(row.y),
      w: Number(row.w),
      h: Number(row.h),
    }));
  },
});
