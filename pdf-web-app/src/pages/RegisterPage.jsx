import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRegister } from '@features/auth/hooks/useAuth';
import { ROUTE_PATHS } from '@shared/constant/route-paths';

const RegisterPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const register = useRegister();

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await register.mutateAsync({ name, email, password });
      navigate(ROUTE_PATHS.login, { replace: true });
    } catch {
      // error surfaced via register.error below
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Kayıt Ol</h1>
        <label>
          Ad Soyad
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label>
          E-posta
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Şifre
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </label>
        {register.isError && (
          <p className="form-error">
            {register.error?.response?.data?.error?.message ?? 'Kayıt sırasında bir hata oluştu.'}
          </p>
        )}
        <button type="submit" disabled={register.isPending}>
          {register.isPending ? 'Kayıt olunuyor…' : 'Kayıt Ol'}
        </button>
        <p>
          Zaten hesabın var mı? <Link to={ROUTE_PATHS.login}>Giriş yap</Link>
        </p>
      </form>
    </div>
  );
};

export default RegisterPage;
