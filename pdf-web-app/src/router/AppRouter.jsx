import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@router/ProtectedRoute';
import LoginPage from '@pages/LoginPage';
import RegisterPage from '@pages/RegisterPage';
import LibraryPage from '@pages/LibraryPage';
import ReaderPage from '@pages/ReaderPage';
import { ROUTE_PATHS } from '@shared/constant/route-paths';

const AppRouter = () => (
  <Routes>
    <Route path={ROUTE_PATHS.login} element={<LoginPage />} />
    <Route path={ROUTE_PATHS.register} element={<RegisterPage />} />

    <Route element={<ProtectedRoute />}>
      <Route path={ROUTE_PATHS.library} element={<LibraryPage />} />
      <Route path={ROUTE_PATHS.reader} element={<ReaderPage />} />
    </Route>

    <Route path="*" element={<Navigate to={ROUTE_PATHS.library} replace />} />
  </Routes>
);

export default AppRouter;
