import { Link } from 'react-router-dom';
import { useDeleteDocument, useDocumentsList } from '@features/document/hooks/useDocuments';
import { buildReaderPath } from '@shared/constant/route-paths';

const STATUS_LABELS = {
  processing: 'İşleniyor…',
  ready: 'Hazır',
  failed: 'Başarısız',
};

const DocumentList = () => {
  const { data: documents, isLoading } = useDocumentsList();
  const deleteDocument = useDeleteDocument();

  if (isLoading) {
    return <p>Belgeler yükleniyor…</p>;
  }

  if (!documents || documents.length === 0) {
    return <p className="empty-state">Henüz bir belge yüklemediniz.</p>;
  }

  const handleDelete = (event, doc) => {
    event.preventDefault();
    event.stopPropagation();
    if (window.confirm(`"${doc.originalName}" silinsin mi?`)) {
      deleteDocument.mutate(doc.id);
    }
  };

  return (
    <ul className="document-list">
      {documents.map((doc) => (
        <li key={doc.id} className="document-list__item">
          <Link to={buildReaderPath(doc.id)}>
            <span className="document-list__name">{doc.originalName}</span>
            <span className={`document-list__status document-list__status--${doc.status}`}>
              {doc.status === 'processing' && doc.progress?.pageCount
                ? `İşleniyor… ${doc.progress.pagesDone}/${doc.progress.pageCount}`
                : (STATUS_LABELS[doc.status] ?? doc.status)}
            </span>
            {doc.status === 'ready' && doc.hasTextLayer === false && (
              <span className="document-list__badge">Taranmış — OCR gerekli</span>
            )}
            <button
              type="button"
              className="document-list__delete"
              onClick={(event) => handleDelete(event, doc)}
              disabled={deleteDocument.isPending}
              aria-label={`${doc.originalName} belgesini sil`}
              title="Sil"
            >
              Sil
            </button>
          </Link>
        </li>
      ))}
    </ul>
  );
};

export default DocumentList;
