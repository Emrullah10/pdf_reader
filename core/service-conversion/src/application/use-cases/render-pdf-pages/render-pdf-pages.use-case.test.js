import { makeRenderPdfPages } from './render-pdf-pages.use-case.js';

describe('makeRenderPdfPages', () => {
  it('fetches the document and renders each page to an image', async () => {
    const documentClient = { getDocument: async () => ({ id: 'doc-1', storagePath: '/tmp/fake.pdf' }) };
    const renderer = { render: async () => [{ pageNo: 1, path: '/tmp/page-1.png' }] };

    const renderPdfPages = makeRenderPdfPages({ documentClient, renderer, tmpDirFactory: () => '/tmp/render-job' });

    const result = await renderPdfPages({ documentId: 'doc-1', authToken: 'token' });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].path).toBe('/tmp/page-1.png');
  });
});
