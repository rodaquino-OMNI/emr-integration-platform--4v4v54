'use client';

import { useEffect, useCallback } from 'react'; // v18.x
import { useRouter } from 'next/navigation'; // v13.x
import { useAuth } from '@/hooks/useAuth';
import Loading from '@/components/common/Loading';

/**
 * Secure logout page component that handles automatic user logout with 
 * comprehensive error handling and HIPAA-compliant session termination
 */
const LogoutPage = () => {
  const router = useRouter();
  const { logout } = useAuth();

  /**
   * Handles secure logout process with comprehensive cleanup
   */
  const handleLogout = useCallback(async () => {
    try {
      // Execute secure logout
      await logout();

      // Clear any sensitive data from local storage
      localStorage.clear();
      sessionStorage.clear();

      // Clear any service worker registrations
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      // Clear any cached credentials
      if ('credentials' in navigator) {
        await (navigator.credentials as any).preventSilentAccess();
      }

      // Redirect to login with security parameters
      router.push('/login?status=logged_out&preventAutoLogin=true');
      
    } catch (error) {
      console.error('Logout failed:', error);
      
      // Ensure user is redirected even if logout fails
      router.push('/login?status=error&preventAutoLogin=true');
    }
  }, [logout, router]);

  // Execute logout immediately on component mount
  useEffect(() => {
    handleLogout();
  }, [handleLogout]);

  return (
    <Loading
      fullScreen
      text="Securely signing out..."
      size="lg"
      variant="spinner"
      reducedMotion={false}
      className="bg-white/95"
    />
  );
};

// Metadata to prevent caching and ensure page is always dynamic
export const metadata = {
  dynamic: 'force-dynamic',
  revalidate: 0
};

export default LogoutPage;