const rowToDocument = (row) => ({
  id: row.id,
  userId: row.user_id,
  originalName: row.original_name,
  mime: row.mime,
  sizeBytes: Number(row.size_bytes),
  pageCount: row.page_count,
  storagePath: row.storage_path,
  status: row.status,
  hasTextLayer: row.has_text_layer,
  errorMessage: row.error_message,
  createdAt: row.created_at,
});

export const makeDocumentRepository = ({ pool }) => ({
  async create({ userId, originalName, mime, sizeBytes, storagePath }) {
    const { rows } = await pool.query(
      `INSERT INTO documents (user_id, original_name, mime, size_bytes, storage_path)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, originalName, mime, sizeBytes, storagePath],
    );
    return rowToDocument(rows[0]);
  },

  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    return rows[0] ? rowToDocument(rows[0]) : null;
  },

  async findByIdAndUser(id, userId) {
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1 AND user_id = $2', [id, userId]);
    return rows[0] ? rowToDocument(rows[0]) : null;
  },

  async listByUser(userId) {
    const { rows } = await pool.query('SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return rows.map(rowToDocument);
  },

  async updateStatus(id, { status, pageCount, hasTextLayer, errorMessage }) {
    const { rows } = await pool.query(
      `UPDATE documents
       SET status = $2, page_count = COALESCE($3, page_count), has_text_layer = COALESCE($4, has_text_layer), error_message = $5
       WHERE id = $1
       RETURNING *`,
      [id, status, pageCount ?? null, hasTextLayer ?? null, errorMessage ?? null],
    );
    return rowToDocument(rows[0]);
  },
});
