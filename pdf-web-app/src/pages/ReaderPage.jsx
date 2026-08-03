import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDocument } from '@features/document/hooks/useDocuments';
import { usePdfDocument } from '@features/document/hooks/usePdfDocument';
import { useSearchDocuments } from '@features/search/hooks/useSearch';
import SearchBar from '@features/search/components/SearchBar';
import SearchResultsList from '@features/search/components/SearchResultsList';
import PdfPageCanvas from '@features/document/components/PdfPageCanvas';
import OcrPrompt from '@features/conversion/components/OcrPrompt';
import { ROUTE_PATHS } from '@shared/constant/route-paths';

const ReaderPage = () => {
  const { documentId } = useParams();
  const { data: document, isLoading } = useDocument(documentId, {
    // query.state.data is the raw response, before the hook's `select` unwraps it — reading
    // .status directly off it always yielded undefined, so polling never started and the page
    // stayed on "işleniyor" until it was remounted.
    refetchInterval: (query) => (query.state.data?.document?.status === 'processing' ? 1500 : false),
  });
  const search = useSearchDocuments();
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);

  // Loaded once here rather than per page: PdfPageCanvas used to call getDocument() itself, so a
  // 1237-page document started 1237 downloads of the same file and none of them completed.
  const documentUrl = `/api/documents/${documentId}/file`;
  const { pdf, error: pdfError } = usePdfDocument(documentUrl);

  const activeMatch = search.data?.matches?.[activeMatchIndex] ?? null;
  const currentPageNo = activeMatch?.pageNo ?? 1;

  const matchesOnCurrentPage = useMemo(() => {
    if (!search.data) return [];
    return search.data.matches.filter((m) => m.pageNo === currentPageNo);
  }, [search.data, currentPageNo]);

  const activeIndexOnPage = useMemo(() => {
    if (!activeMatch) return -1;
    return matchesOnCurrentPage.findIndex((m) => m === activeMatch);
  }, [matchesOnCurrentPage, activeMatch]);

  const handleSearch = async (query) => {
    setActiveMatchIndex(-1);
    const result = await search.mutateAsync({ query, documentIds: [documentId] });
    if (result.matches.length > 0) {
      setActiveMatchIndex(0);
    }
  };

  if (isLoading) {
    return <p>Belge yükleniyor…</p>;
  }

  if (!document) {
    return <p>Belge bulunamadı.</p>;
  }

  return (
    <div className="reader-page">
      <header className="reader-page__header">
        <Link to={ROUTE_PATHS.library}>&larr; Kütüphane</Link>
        <h1>{document.originalName}</h1>
      </header>

      {document.status === 'processing' && (
        <p>
          {document.progress?.pageCount
            ? `Belge işleniyor: ${document.progress.pagesDone}/${document.progress.pageCount} sayfa…`
            : document.progress?.pagesDone
              ? `Belge işleniyor: ${document.progress.pagesDone} sayfa…`
              : 'Belge işleniyor, lütfen bekleyin…'}
        </p>
      )}
      {document.status === 'failed' && (
        <p className="form-error">Bu belge işlenemedi: {document.errorMessage}</p>
      )}

      {document.status === 'ready' && document.hasTextLayer === false && <OcrPrompt documentId={documentId} />}

      {document.status === 'ready' && (
        <div className="reader-page__body">
          <aside className="reader-page__sidebar">
            <SearchBar onSearch={handleSearch} isSearching={search.isPending} />
            <SearchResultsList
              result={search.data}
              activeMatchIndex={activeMatchIndex}
              onSelectMatch={setActiveMatchIndex}
            />
          </aside>

          <main className="reader-page__viewer">
            {pdfError && <p className="form-error">Belge görüntülenemedi.</p>}
            {!pdf && !pdfError && <p>Belge açılıyor…</p>}
            {pdf &&
              Array.from({ length: document.pageCount ?? 1 }, (_, i) => i + 1).map((pageNo) => (
                <PdfPageCanvas
                  key={pageNo}
                  pdf={pdf}
                  pageNo={pageNo}
                  matches={pageNo === currentPageNo ? matchesOnCurrentPage : []}
                  activeMatchIndex={pageNo === currentPageNo ? activeIndexOnPage : -1}
                />
              ))}
          </main>
        </div>
      )}
    </div>
  );
};

export default ReaderPage;
