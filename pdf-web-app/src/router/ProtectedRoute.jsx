import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@store/useAuthStore';
import { ROUTE_PATHS } from '@shared/constant/route-paths';

const ProtectedRoute = () => {
  const status = useAuthStore((s) => s.status);

  if (status !== 'authenticated') {
    return <Navigate to={ROUTE_PATHS.login} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
