import { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Loads the PDF once for the whole reader and hands the same PDFDocumentProxy to every page.
// Each page component used to call getDocument() itself, which meant a 1237-page document issued
// 1237 parallel downloads of the same file — none of them finished and the viewer stayed blank.
export const usePdfDocument = (documentUrl) => {
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadingTask = pdfjsLib.getDocument({ url: documentUrl, withCredentials: true });

    loadingTask.promise.then(
      (loaded) => {
        if (cancelled) {
          loaded.destroy();
          return;
        }
        setPdf(loaded);
      },
      (err) => {
        if (!cancelled) setError(err);
      },
    );

    return () => {
      cancelled = true;
      // Frees the worker's copy of the file; without this, navigating between documents leaks a
      // full PDF per visit.
      loadingTask.destroy();
      setPdf(null);
      setError(null);
    };
  }, [documentUrl]);

  return { pdf, error };
};
