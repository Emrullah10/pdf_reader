const rowToPage = (row) => ({
  id: row.id,
  documentId: row.document_id,
  pageNo: row.page_no,
  width: Number(row.width),
  height: Number(row.height),
});

export const makeDocumentPageRepository = ({ pool }) => ({
  // Inserts every page in a batch with a single round trip via UNNEST, instead of one INSERT per
  // page. Accepts an optional `client` (e.g. from withTransaction) so the caller can batch page and
  // word writes for the same pages atomically.
  async createMany(documentId, pages, { client } = {}) {
    if (pages.length === 0) return [];
    const runner = client ?? pool;

    const { rows } = await runner.query(
      `INSERT INTO document_pages (document_id, page_no, width, height)
       SELECT * FROM UNNEST($1::uuid[], $2::int[], $3::numeric[], $4::numeric[])
       RETURNING *`,
      [
        pages.map(() => documentId),
        pages.map((p) => p.pageNo),
        pages.map((p) => p.width),
        pages.map((p) => p.height),
      ],
    );
    return rows.map(rowToPage);
  },

  async listByDocument(documentId) {
    const { rows } = await pool.query('SELECT * FROM document_pages WHERE document_id = $1 ORDER BY page_no', [documentId]);
    return rows.map(rowToPage);
  },
});
