import { makeOcrDocument } from './ocr-document.use-case.js';

describe('makeOcrDocument', () => {
  it('renders each page, OCRs it, and pushes words back to the document service', async () => {
    const pushed = [];
    const documentClient = {
      getDocument: async () => ({ id: 'doc-1', storagePath: '/tmp/fake.pdf' }),
      pushPageWords: async (documentId, pageNo, words) => {
        pushed.push({ documentId, pageNo, words });
      },
    };
    const renderer = {
      render: async () => [
        { pageNo: 1, path: '/tmp/page-1.png' },
        { pageNo: 2, path: '/tmp/page-2.png' },
      ],
    };
    const ocrEngine = {
      recognize: async (path) => ({
        words: path.includes('page-1') ? [{ text: 'Hello', x: 0, y: 0, w: 10, h: 10, wordIndex: 0 }] : [],
      }),
    };

    const ocrDocument = makeOcrDocument({ documentClient, renderer, ocrEngine, tmpDirFactory: () => '/tmp/ocr-job' });

    const result = await ocrDocument({ documentId: 'doc-1', authToken: 'token' });

    expect(result.pagesProcessed).toBe(2);
    expect(result.wordsExtracted).toBe(1);
    expect(pushed).toHaveLength(1);
    expect(pushed[0].pageNo).toBe(1);
  });

  it('skips pushing words for pages with no OCR results', async () => {
    const pushed = [];
    const documentClient = {
      getDocument: async () => ({ id: 'doc-1', storagePath: '/tmp/fake.pdf' }),
      pushPageWords: async (...args) => pushed.push(args),
    };
    const renderer = { render: async () => [{ pageNo: 1, path: '/tmp/page-1.png' }] };
    const ocrEngine = { recognize: async () => ({ words: [] }) };

    const ocrDocument = makeOcrDocument({ documentClient, renderer, ocrEngine, tmpDirFactory: () => '/tmp/ocr-job' });

    const result = await ocrDocument({ documentId: 'doc-1', authToken: 'token' });

    expect(result.wordsExtracted).toBe(0);
    expect(pushed).toHaveLength(0);
  });
});
