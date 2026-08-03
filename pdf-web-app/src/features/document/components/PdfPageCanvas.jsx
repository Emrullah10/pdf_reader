import { useEffect, useRef, useState } from 'react';
import HighlightLayer from '@features/search/components/HighlightLayer';

// Rendering every page of a long document at once costs one canvas bitmap per page, which is far
// more memory than a browser will give us. Pages render when they scroll near the viewport and
// keep their canvas afterwards; the margin starts the work early enough that scrolling normally
// lands on an already-rendered page.
const VISIBILITY_MARGIN = '600px';

// pdf: shared PDFDocumentProxy from usePdfDocument — every page draws from the same loaded file.
// pageNo: 1-based page to display.
// matches: search hits on this page (x, y, w, h in PDF user space).
const PdfPageCanvas = ({ pdf, pageNo, matches = [], activeMatchIndex = -1 }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || isVisible) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Once a page has been rendered we stop observing it: re-rendering on every scroll past
        // would throw away work we already paid for.
        if (entry.isIntersecting) setIsVisible(true);
      },
      { rootMargin: VISIBILITY_MARGIN },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!pdf || !isVisible) return undefined;

    let cancelled = false;
    let renderTask = null;

    const render = async () => {
      try {
        const page = await pdf.getPage(pageNo);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setPageSize({ width: viewport.width / 1.5, height: viewport.height / 1.5 });

        const context = canvas.getContext('2d');
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (err) {
        // A cancelled render rejects too; that is our own cleanup, not a failure worth showing.
        if (!cancelled) setError(err);
      }
    };

    render();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNo, isVisible]);

  if (error) {
    return <p className="form-error">Sayfa yüklenirken bir hata oluştu.</p>;
  }

  return (
    // Placeholder keeps un-rendered pages from collapsing to zero height, so the scrollbar
    // reflects the real document length and observers fire as the user scrolls.
    <div className="pdf-page-canvas" ref={containerRef} style={pageSize.height ? undefined : { minHeight: 800 }}>
      <canvas ref={canvasRef} />
      <HighlightLayer
        matches={matches}
        pageWidth={pageSize.width}
        pageHeight={pageSize.height}
        activeMatchIndex={activeMatchIndex}
      />
    </div>
  );
};

export default PdfPageCanvas;
