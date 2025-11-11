import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../src/context/AuthContext';

interface WrapperProps {
  children: React.ReactNode;
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
  queryClient?: QueryClient;
  authUser?: any;
}

export const createWrapper = (options: CustomRenderOptions = {}) => {
  const {
    initialEntries = ['/'],
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          cacheTime: 0
        }
      }
    }),
    authUser = null
  } = options;

  const Wrapper: React.FC<WrapperProps> = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider initialUser={authUser}>
          {children}
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );

  return Wrapper;
};

export const renderWithProviders = (
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) => {
  const Wrapper = createWrapper(options);

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient: options.queryClient
  };
};

export const renderWithAuth = (
  ui: React.ReactElement,
  authUser: any,
  options: CustomRenderOptions = {}
) => {
  return renderWithProviders(ui, { ...options, authUser });
};

// Helper to wait for async updates
export const waitForLoadingToFinish = () =>
  new Promise(resolve => setTimeout(resolve, 0));
