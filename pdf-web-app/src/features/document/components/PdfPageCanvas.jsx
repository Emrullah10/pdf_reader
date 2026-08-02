import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import HighlightLayer from '@features/search/components/HighlightLayer';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// documentUrl: taranan/orijinal PDF'in indirilebilir URL'i (bu servis üzerinden proxy'lenir).
// pageNo: gösterilecek sayfa (1-tabanlı).
// matches: bu sayfaya ait arama eşleşmeleri (x, y, w, h — PDF user-space koordinatlarında).
const PdfPageCanvas = ({ documentUrl, pageNo, matches = [], activeMatchIndex = -1 }) => {
  const canvasRef = useRef(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask = null;

    const render = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ url: documentUrl, withCredentials: true });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

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
        if (!cancelled) setError(err);
      }
    };

    render();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [documentUrl, pageNo]);

  if (error) {
    return <p className="form-error">Sayfa yüklenirken bir hata oluştu.</p>;
  }

  return (
    <div className="pdf-page-canvas">
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
