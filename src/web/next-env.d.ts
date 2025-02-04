/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file is auto-generated and should not be edited manually.
// It provides TypeScript definitions for Next.js environment and features.

// @types/node ^18.0.0
// @types/react ^18.0.0
// @types/react-dom ^18.0.0

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * Public API URL for frontend service requests
     */
    NEXT_PUBLIC_API_URL: string;

    /**
     * Auth0 domain for SSO authentication
     */
    NEXT_PUBLIC_AUTH0_DOMAIN: string;

    /**
     * Auth0 client ID for application authentication
     */
    NEXT_PUBLIC_AUTH0_CLIENT_ID: string;

    /**
     * EMR integration service endpoint URL
     */
    NEXT_PUBLIC_EMR_INTEGRATION_URL: string;

    /**
     * Task management service endpoint URL
     */
    NEXT_PUBLIC_TASK_SERVICE_URL: string;

    /**
     * Shift handover service endpoint URL
     */
    NEXT_PUBLIC_HANDOVER_SERVICE_URL: string;
  }
}

// Ensure Next.js types are properly augmented
interface StaticImageData {
  src: string;
  height: number;
  width: number;
  blurDataURL?: string;
}

declare module "*.png" {
  const content: StaticImageData;
  export default content;
}

declare module "*.jpg" {
  const content: StaticImageData;
  export default content;
}

declare module "*.jpeg" {
  const content: StaticImageData;
  export default content;
}

declare module "*.gif" {
  const content: StaticImageData;
  export default content;
}

declare module "*.webp" {
  const content: StaticImageData;
  export default content;
}

declare module "*.avif" {
  const content: StaticImageData;
  export default content;
}

declare module "*.ico" {
  const content: StaticImageData;
  export default content;
}

declare module "*.bmp" {
  const content: StaticImageData;
  export default content;
}