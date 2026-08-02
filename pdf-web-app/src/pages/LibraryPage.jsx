import { useLogout } from '@features/auth/hooks/useAuth';
import { useAuthStore } from '@store/useAuthStore';
import UploadDropzone from '@features/document/components/UploadDropzone';
import DocumentList from '@features/document/components/DocumentList';

const LibraryPage = () => {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();

  return (
    <div className="library-page">
      <header className="library-page__header">
        <h1>PDF Reader</h1>
        <div className="library-page__user">
          <span>{user?.name}</span>
          <button type="button" onClick={() => logout.mutate()}>
            Çıkış Yap
          </button>
        </div>
      </header>

      <UploadDropzone />
      <DocumentList />
    </div>
  );
};

export default LibraryPage;
