// Jest setup file for test environment configuration

// Mock window.__squashExtension
declare global {
  interface Window {
    __squashExtension?: {
      version: string;
      getContext: (options?: any) => Promise<any>;
      requestPermission: (config: any) => Promise<{ granted: boolean; isFirstTime: boolean }>;
      isPermissionGranted: () => boolean;
    };
  }
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }))
});

// Clean up after each test
afterEach(() => {
  // Reset window.__squashExtension
  delete window.__squashExtension;
  
  // Clear all mocks
  jest.clearAllMocks();
  
  // Clear localStorage and sessionStorage
  localStorage.clear();
  sessionStorage.clear();
});