import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUploadDocument } from '@features/document/hooks/useDocuments';
import { buildReaderPath } from '@shared/constant/route-paths';

const UploadDropzone = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const upload = useUploadDocument();

  const handleFile = useCallback(
    async (file) => {
      if (!file || file.type !== 'application/pdf') {
        return;
      }
      setProgress(0);
      const result = await upload.mutateAsync({ file, onProgress: setProgress });
      navigate(buildReaderPath(result.document.id));
    },
    [upload, navigate],
  );

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={`upload-dropzone${isDragging ? ' upload-dropzone--active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {upload.isPending ? (
        <p>Yükleniyor… %{progress}</p>
      ) : (
        <p>PDF dosyanızı buraya sürükleyin veya tıklayarak seçin</p>
      )}
      {upload.isError && <p className="form-error">Yükleme başarısız oldu, tekrar deneyin.</p>}
    </div>
  );
};

export default UploadDropzone;
