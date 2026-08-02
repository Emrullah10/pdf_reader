import { useRunOcr } from '@features/conversion/hooks/useConversion';

const OcrPrompt = ({ documentId }) => {
  const runOcr = useRunOcr();

  if (runOcr.isSuccess) {
    return <p className="ocr-prompt ocr-prompt--done">OCR tamamlandı, artık bu belgede arama yapabilirsiniz.</p>;
  }

  return (
    <div className="ocr-prompt">
      <p>Bu belge taranmış görünüyor, metin katmanı bulunamadı. Arama yapabilmek için OCR çalıştırın.</p>
      <button type="button" onClick={() => runOcr.mutate(documentId)} disabled={runOcr.isPending}>
        {runOcr.isPending ? 'OCR çalışıyor… (birkaç dakika sürebilir)' : "OCR Çalıştır"}
      </button>
      {runOcr.isError && <p className="form-error">OCR sırasında bir hata oluştu.</p>}
    </div>
  );
};

export default OcrPrompt;
