export const makePageWordRepository = ({ pool }) => ({
  // Accepts words for one or more pages in a single batch: `pageIds` is parallel to `words`,
  // giving each word's page_id (rather than one call per page). No RETURNING — callers never use
  // the inserted rows, and shipping thousands of them back over the wire on every flush was pure
  // waste. Accepts an optional `client` for use inside withTransaction.
  async createMany(pageIds, words, { client } = {}) {
    if (words.length === 0) return;
    const runner = client ?? pool;

    await runner.query(
      `INSERT INTO page_words (page_id, text, text_normalized, x, y, w, h, word_index)
       SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::int[])`,
      [
        pageIds,
        words.map((w) => w.text),
        words.map((w) => w.textNormalized),
        words.map((w) => w.x),
        words.map((w) => w.y),
        words.map((w) => w.w),
        words.map((w) => w.h),
        words.map((w) => w.wordIndex),
      ],
    );
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
