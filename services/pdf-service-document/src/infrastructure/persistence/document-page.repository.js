// KNOWN GAP: writes here are not wrapped in a transaction with the parent document's
// status update. If a later page's write fails mid-upload, earlier pages' rows can be
// left orphaned under a document marked status='failed'. See core/service-document's
// upload-document.use-case.js for the calling context. Fixing this requires either a
// transaction-aware repository wrapper injected into the use-case layer, or a cleanup
// step (DELETE FROM document_pages WHERE document_id = ...) in the use-case's catch
// block — deferred as a follow-up, not blocking for this phase.

const rowToPage = (row) => ({
  id: row.id,
  documentId: row.document_id,
  pageNo: row.page_no,
  width: Number(row.width),
  height: Number(row.height),
});

export const makeDocumentPageRepository = ({ pool }) => ({
  async createMany(documentId, pages) {
    const created = [];
    for (const page of pages) {
      const { rows } = await pool.query(
        `INSERT INTO document_pages (document_id, page_no, width, height)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [documentId, page.pageNo, page.width, page.height],
      );
      created.push(rowToPage(rows[0]));
    }
    return created;
  },

  async listByDocument(documentId) {
    const { rows } = await pool.query('SELECT * FROM document_pages WHERE document_id = $1 ORDER BY page_no', [documentId]);
    return rows.map(rowToPage);
  },
});
