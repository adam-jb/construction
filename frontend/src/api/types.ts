/**
 * API Types
 * 
 * Re-export types from shared package for convenience.
 * Add any frontend-specific API types here.
 */

export * from '@construction-ai/shared';

// Frontend-specific API types can go here
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}
