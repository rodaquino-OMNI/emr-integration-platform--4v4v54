'use client';

import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import HandoverDetails from '@/components/dashboard/HandoverDetails';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import Loading from '@/components/common/Loading';
import { useHandovers } from '@/hooks/useHandovers';

// Metadata generation for SEO and accessibility
export async function generateMetadata({ params }: { params: { id: string } }) {
  try {
    return {
      title: `Handover Details #${params.id} | EMR Task Management`,
      description: 'Secure shift handover details with EMR verification',
      openGraph: {
        title: `Handover Details #${params.id}`,
        description: 'EMR-verified shift handover information',
        type: 'website',
      },
      robots: {
        index: false, // Prevent indexing of sensitive healthcare data
        follow: false,
      },
    };
  } catch (error) {
    return {
      title: 'Handover Details | EMR Task Management',
      description: 'Shift handover information',
    };
  }
}

// Props interface for the page component
interface HandoverPageProps {
  params: {
    id: string;
  };
  searchParams?: {
    emrVerification?: string;
  };
}

/**
 * Server component for displaying detailed handover information
 * Implements real-time updates and EMR verification with HIPAA compliance
 */
export default function HandoverPage({ params, searchParams }: HandoverPageProps) {
  // Validate handover ID format
  if (!params.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
    notFound();
  }

  // Initialize handover hook with real-time updates
  const {
    currentHandover,
    isLoading,
    error,
    emrVerificationStatus,
  } = useHandovers({
    revalidateInterval: 30000, // 30 second refresh interval
    verificationTimeout: 5000, // 5 second EMR verification timeout
    autoSync: true, // Enable automatic offline sync
  });

  // Handle non-existent handovers
  if (!isLoading && !currentHandover && !error) {
    notFound();
  }

  return (
    <div className="flex flex-col min-h-screen p-6 bg-white dark:bg-gray-900">
      <div className="flex-1 max-w-7xl mx-auto w-full space-y-6">
        <ErrorBoundary
          fallback={
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">
                An error occurred while loading the handover details.
                Please try again later.
              </p>
            </div>
          }
        >
          <Suspense
            fallback={
              <Loading
                size="lg"
                text="Loading handover details..."
                variant="spinner"
                className="py-12"
              />
            }
          >
            <HandoverDetails
              handoverId={params.id}
              className="rounded-lg shadow-sm"
              offlineMode={false}
              onVerificationComplete={() => {
                // Handle EMR verification completion
                console.info('EMR verification completed successfully');
              }}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}