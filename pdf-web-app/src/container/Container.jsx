import { BrowserRouter } from 'react-router-dom';
import QueryProvider from '@shared/providers/QueryProvider';
import AuthBootstrap from '@container/AuthBootstrap';
import AppRouter from '@router/AppRouter';

const Container = () => (
  <QueryProvider>
    <BrowserRouter>
      <AuthBootstrap>
        <AppRouter />
      </AuthBootstrap>
    </BrowserRouter>
  </QueryProvider>
);

export default Container;
