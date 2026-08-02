export const makeDocumentClient = ({ baseUrl }) => ({
  async getDocument(documentId, authToken) {
    const res = await fetch(`${baseUrl}/api/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch document ${documentId}: ${res.status}`);
    }
    const { document } = await res.json();
    return document;
  },

  async pushPageWords(documentId, pageNo, words, authToken) {
    const res = await fetch(`${baseUrl}/api/documents/${documentId}/pages/${pageNo}/words`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ words }),
    });
    if (!res.ok) {
      throw new Error(`Failed to push words for document ${documentId} page ${pageNo}: ${res.status}`);
    }
    return res.json();
  },
});
