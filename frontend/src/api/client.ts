/**
 * API Client
 * 
 * Main entry point for all API calls.
 * Toggle between mock and real API via environment variable.
 */

import { mockAPI } from './mock';
import { realAPI } from './real';

// Toggle between mock and real API
const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true';

console.log(`🔌 API Mode: ${USE_MOCK_API ? 'MOCK' : 'REAL'}`);

export const apiClient = USE_MOCK_API ? mockAPI : realAPI;

export default apiClient;
