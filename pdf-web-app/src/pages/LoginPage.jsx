import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogin } from '@features/auth/hooks/useAuth';
import { ROUTE_PATHS } from '@shared/constant/route-paths';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const login = useLogin();

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await login.mutateAsync({ email, password });
      navigate(ROUTE_PATHS.library, { replace: true });
    } catch {
      // error surfaced via login.error below
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Giriş Yap</h1>
        <label>
          E-posta
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Şifre
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {login.isError && <p className="form-error">E-posta veya şifre hatalı.</p>}
        <button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Giriş yapılıyor…' : 'Giriş Yap'}
        </button>
        <p>
          Hesabın yok mu? <Link to={ROUTE_PATHS.register}>Kayıt ol</Link>
        </p>
      </form>
    </div>
  );
};

export default LoginPage;
