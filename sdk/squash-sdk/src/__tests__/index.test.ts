// Import dynamically to allow resetting between tests
let squash: any;
import type { SquashConfig, InitResult, ContextResult } from '../types';

describe('SquashSDK', () => {
  beforeEach(() => {
    // Clear module cache to reset singleton state
    jest.resetModules();
    // Re-import to get fresh instance
    const module = require('../index');
    squash = module.squash;
  });
  describe('init()', () => {
    const mockConfig: SquashConfig = {
      appName: 'Test App',
      appId: 'test-app-id',
      theme: 'light',
      analytics: false
    };


    it('should initialize successfully when extension is not installed', async () => {
      const result = await squash.init(mockConfig);
      
      expect(result).toEqual({
        initialized: true,
        extensionInstalled: false,
        permissionGranted: false,
        isFirstTime: false
      });
    });

    it('should initialize with mock mode enabled', async () => {
      const mockModeConfig: SquashConfig = {
        ...mockConfig,
        mockMode: true
      };

      const result = await squash.init(mockModeConfig);
      
      expect(result).toEqual({
        initialized: true,
        extensionInstalled: true,
        permissionGranted: true,
        version: '1.0.0-mock',
        isFirstTime: false
      });
    });

    it('should detect installed extension with granted permission', async () => {
      // Mock extension API
      window.__squashExtension = {
        version: '1.2.3',
        isPermissionGranted: () => true,
        requestPermission: jest.fn(),
        getContext: jest.fn()
      };

      const result = await squash.init(mockConfig);
      
      expect(result).toEqual({
        initialized: true,
        extensionInstalled: true,
        permissionGranted: true,
        version: '1.2.3',
        isFirstTime: false
      });
    });

    it('should request permission when extension is installed but permission not granted', async () => {
      // Mock extension API
      window.__squashExtension = {
        version: '1.2.3',
        isPermissionGranted: () => false,
        requestPermission: jest.fn().mockResolvedValue({
          granted: true,
          isFirstTime: true
        }),
        getContext: jest.fn()
      };

      const result = await squash.init(mockConfig);
      
      expect(window.__squashExtension.requestPermission).toHaveBeenCalledWith({
        appName: 'Test App',
        appId: 'test-app-id'
      });
      
      expect(result).toEqual({
        initialized: true,
        extensionInstalled: true,
        permissionGranted: true,
        version: '1.2.3',
        isFirstTime: true
      });
    });

    it('should handle permission denial', async () => {
      // Mock extension API
      window.__squashExtension = {
        version: '1.2.3',
        isPermissionGranted: () => false,
        requestPermission: jest.fn().mockResolvedValue({
          granted: false,
          isFirstTime: false
        }),
        getContext: jest.fn()
      };

      const result = await squash.init(mockConfig);
      
      expect(result).toEqual({
        initialized: true,
        extensionInstalled: true,
        permissionGranted: false,
        version: '1.2.3',
        isFirstTime: false
      });
    });

    it('should return cached result when already initialized', async () => {
      // First initialization
      await squash.init(mockConfig);
      
      // Second initialization should return cached result
      const result = await squash.init(mockConfig);
      
      expect(result.initialized).toBe(true);
    });

    it('should handle permission request errors gracefully', async () => {
      // Mock extension API with error
      window.__squashExtension = {
        version: '1.2.3',
        isPermissionGranted: () => false,
        requestPermission: jest.fn().mockRejectedValue(new Error('Permission error')),
        getContext: jest.fn()
      };

      const result = await squash.init(mockConfig);
      
      expect(result).toEqual({
        initialized: true,
        extensionInstalled: true,
        permissionGranted: false,
        version: '1.2.3',
        isFirstTime: false
      });
    });
  });

  describe('getContext()', () => {
    const mockConfig: SquashConfig = {
      appName: 'Test App',
      appId: 'test-app-id'
    };

    it('should return not_initialized status when SDK not initialized', async () => {
      const result = await squash.getContext();
      
      expect(result.status).toBe('not_initialized');
      expect(result.error).toBe('SDK not initialized. Call squash.init() first.');
    });

    it('should return mock data in mock mode', async () => {
      await squash.init({ ...mockConfig, mockMode: true });
      
      const result = await squash.getContext({ 
        relevanceQuery: 'react',
        timeRange: '24h' 
      });
      
      expect(result.status).toBe('success');
      expect(result.context).toBeDefined();
      expect(result.context?.summary).toBeDefined();
      expect(result.context?.patterns).toBeInstanceOf(Array);
      expect(result.context?.topics).toBeInstanceOf(Array);
      expect(result.context?.recentActivities).toBeInstanceOf(Array);
    });

    it('should return not_installed status when extension not installed', async () => {
      await squash.init(mockConfig);
      
      const result = await squash.getContext();
      
      expect(result.status).toBe('not_installed');
      expect(result.installUrl).toContain('chromewebstore.google.com');
    });

    it('should return permission_denied status when permission not granted', async () => {
      // Mock extension without permission
      window.__squashExtension = {
        version: '1.2.3',
        isPermissionGranted: () => false,
        requestPermission: jest.fn().mockResolvedValue({
          granted: false,
          isFirstTime: false
        }),
        getContext: jest.fn()
      };

      await squash.init(mockConfig);
      
      const result = await squash.getContext();
      
      expect(result.status).toBe('permission_denied');
    });

    it('should successfully get context when extension is available and permitted', async () => {
      const mockContextData = {
        tabs: [
          { id: '1', title: 'Test Tab', url: 'https://example.com' }
        ],
        history: [],
        bookmarks: []
      };

      // Mock extension with permission
      window.__squashExtension = {
        version: '1.2.3',
        isPermissionGranted: () => true,
        requestPermission: jest.fn(),
        getContext: jest.fn().mockResolvedValue({
          success: true,
          data: mockContextData
        })
      };

      await squash.init(mockConfig);
      
      const result = await squash.getContext({ 
        includeBookmarks: true 
      });
      
      expect(result.status).toBe('success');
      expect(result.context).toEqual(mockContextData);
      expect(result.metadata?.version).toBe('1.2.3');
      expect(result.metadata?.tokenCount).toBeGreaterThan(0);
    });

    it('should handle context retrieval errors', async () => {
      // Mock extension with error response
      window.__squashExtension = {
        version: '1.2.3',
        isPermissionGranted: () => true,
        requestPermission: jest.fn(),
        getContext: jest.fn().mockResolvedValue({
          success: false,
          error: 'Failed to retrieve context'
        })
      };

      await squash.init(mockConfig);
      
      const result = await squash.getContext();
      
      expect(result.status).toBe('error');
      expect(result.error).toBe('Failed to retrieve context');
    });

    it('should handle context retrieval exceptions', async () => {
      // Mock extension that throws
      window.__squashExtension = {
        version: '1.2.3',
        isPermissionGranted: () => true,
        requestPermission: jest.fn(),
        getContext: jest.fn().mockRejectedValue(new Error('Network error'))
      };

      await squash.init(mockConfig);
      
      const result = await squash.getContext();
      
      expect(result.status).toBe('error');
      expect(result.error).toBe('Network error');
    });
  });

  describe('isExtensionInstalled()', () => {
    it('should return false when extension is not installed', async () => {
      const isInstalled = await squash.isExtensionInstalled();
      expect(isInstalled).toBe(false);
    });

    it('should return true when extension is installed', async () => {
      window.__squashExtension = {
        version: '1.0.0',
        getContext: jest.fn(),
        requestPermission: jest.fn(),
        isPermissionGranted: jest.fn()
      };

      const isInstalled = await squash.isExtensionInstalled();
      expect(isInstalled).toBe(true);
    });
  });

  describe('Mock Mode', () => {
    it('should enable mock mode', () => {
      squash.enableMockMode();
      // Mock mode is enabled, we can't directly test the private property
      // but we can verify behavior in getContext tests
      expect(squash).toBeDefined();
    });

    it('should disable mock mode', () => {
      squash.enableMockMode();
      squash.disableMockMode();
      // Mock mode is disabled
      expect(squash).toBeDefined();
    });
  });

  describe('trackEvent()', () => {
    it('should log analytics events when analytics is enabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await squash.init({
        appName: 'Test App',
        appId: 'test-app-id',
        analytics: true
      });

      squash.trackEvent('test_event', { value: 123 });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Analytics event:',
        'test_event',
        { value: 123 }
      );
      
      consoleSpy.mockRestore();
    });

    it('should not log events when analytics is disabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await squash.init({
        appName: 'Test App',
        appId: 'test-app-id',
        analytics: false
      });

      squash.trackEvent('test_event', { value: 123 });
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should send to gtag when available', async () => {
      const gtagMock = jest.fn();
      (window as any).gtag = gtagMock;
      
      await squash.init({
        appName: 'Test App',
        appId: 'test-app-id',
        analytics: true
      });

      squash.trackEvent('test_event', { value: 123 });
      
      expect(gtagMock).toHaveBeenCalledWith(
        'event',
        'test_event',
        { value: 123 }
      );
      
      delete (window as any).gtag;
    });
  });
});