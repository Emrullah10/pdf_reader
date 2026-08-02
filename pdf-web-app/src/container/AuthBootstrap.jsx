import { useEffect } from 'react';
import { meRequest } from '@api/auth';
import { useAuthStore } from '@store/useAuthStore';

const VERIFY_TIMEOUT_MS = 8000;

const AuthBootstrap = ({ children }) => {
  const status = useAuthStore((s) => s.status);
  const setUser = useAuthStore((s) => s.setUser);
  const setChecking = useAuthStore((s) => s.setChecking);
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    let didFinish = false;
    setChecking();

    const timeoutId = setTimeout(() => {
      if (!didFinish) {
        didFinish = true;
        clear();
      }
    }, VERIFY_TIMEOUT_MS);

    meRequest()
      .then((data) => {
        if (didFinish) return;
        didFinish = true;
        clearTimeout(timeoutId);
        setUser(data.user);
      })
      .catch(() => {
        if (didFinish) return;
        didFinish = true;
        clearTimeout(timeoutId);
        clear();
      });

    return () => {
      didFinish = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'idle' || status === 'checking') {
    return (
      <div className="app-loading-screen">
        <span>Yükleniyor…</span>
      </div>
    );
  }

  return children;
};

export default AuthBootstrap;
