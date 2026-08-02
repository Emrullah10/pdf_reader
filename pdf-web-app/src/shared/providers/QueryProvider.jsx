import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const QueryProvider = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

export default QueryProvider;
