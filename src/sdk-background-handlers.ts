/**
 * Background handlers for SDK API requests
 */

import { logger } from './utils/shared-utils';
import { ChromeStorage } from './utils/storage';

// Track pending permission requests
const pendingPermissionRequests = new Map<string, (granted: boolean) => void>();

// Show permission dialog
async function showPermissionDialog(appInfo: { appName: string; appId: string }, domain: string): Promise<boolean> {
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).substr(2, 9);
    pendingPermissionRequests.set(requestId, resolve);

    // Create a new window with the permission dialog
    const width = 520;
    const height = 480;
    const url = chrome.runtime.getURL(`permission-dialog.html?appName=${encodeURIComponent(appInfo.appName)}&domain=${encodeURIComponent(domain)}&requestId=${requestId}`);
    
    chrome.windows.create({
      url,
      type: 'popup',
      width,
      height,
      left: Math.round((screen.width - width) / 2),
      top: Math.round((screen.height - height) / 2),
    });

    // Set a timeout in case the window is closed without a response
    setTimeout(() => {
      if (pendingPermissionRequests.has(requestId)) {
        pendingPermissionRequests.delete(requestId);
        resolve(false);
      }
    }, 60000); // 1 minute timeout
  });
}

// Get context data for SDK
async function getContextForSDK(options: any): Promise<any> {
  try {
    // Get memory from storage
    const storage = new ChromeStorage();
    const memory = await storage.getMemory();
    
    if (!memory) {
      return null;
    }

    // Filter based on options
    let context = {
      summary: memory.summary || 'No browsing patterns analyzed yet',
      patterns: memory.patterns || [],
      topics: memory.interests?.map(interest => ({
        topic: interest,
        relevance: 0.8, // Simplified for now
        keywords: []
      })) || [],
      recentActivities: [] // Could be populated from recent history
    };

    // Apply relevance query filter if provided
    if (options.relevanceQuery) {
      const queryTerms = options.relevanceQuery.toLowerCase().split(',').map(t => t.trim());
      
      // Filter patterns
      context.patterns = context.patterns.filter(pattern => 
        queryTerms.some(term => pattern.name.toLowerCase().includes(term) || 
                               pattern.description?.toLowerCase().includes(term))
      );
      
      // Filter topics
      context.topics = context.topics.filter(topic =>
        queryTerms.some(term => topic.topic.toLowerCase().includes(term))
      );
    }

    // Apply token limit if specified
    if (options.maxTokens) {
      // Simplified token counting (roughly 4 chars per token)
      const contextString = JSON.stringify(context);
      const estimatedTokens = contextString.length / 4;
      
      if (estimatedTokens > options.maxTokens) {
        // Truncate patterns and topics proportionally
        const ratio = options.maxTokens / estimatedTokens;
        context.patterns = context.patterns.slice(0, Math.floor(context.patterns.length * ratio));
        context.topics = context.topics.slice(0, Math.floor(context.topics.length * ratio));
      }
    }

    return context;
  } catch (error) {
    logger.error('Error getting context for SDK:', error);
    return null;
  }
}

// Handle SDK messages
export async function handleSDKMessage(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
): Promise<boolean> {
  switch (message.type) {
    case 'SDK_REQUEST_PERMISSION':
      try {
        // Check if permission already exists
        const storage = new ChromeStorage();
        const key = `permission_${message.domain}`;
        const existing = await storage.get(key);
        
        if (existing !== undefined) {
          sendResponse({ granted: existing === true });
          return true;
        }

        // Show permission dialog
        const granted = await showPermissionDialog(message.appInfo, message.domain);
        await storage.set(key, granted);
        
        sendResponse({ granted });
      } catch (error) {
        logger.error('Error handling permission request:', error);
        sendResponse({ granted: false });
      }
      return true;

    case 'SDK_GET_CONTEXT':
      try {
        // Verify permission first
        const storage = new ChromeStorage();
        const key = `permission_${message.domain}`;
        const hasPermission = await storage.get(key);
        
        if (!hasPermission) {
          sendResponse({ success: false, error: 'Permission not granted' });
          return true;
        }

        // Get context data
        const context = await getContextForSDK(message.options);
        
        if (context) {
          sendResponse({ success: true, data: context });
        } else {
          sendResponse({ success: false, error: 'No context available' });
        }
      } catch (error) {
        logger.error('Error getting context:', error);
        sendResponse({ success: false, error: 'Failed to get context' });
      }
      return true;

    case 'PERMISSION_RESPONSE':
      // Handle response from permission dialog
      if (message.requestId && pendingPermissionRequests.has(message.requestId)) {
        const resolver = pendingPermissionRequests.get(message.requestId);
        pendingPermissionRequests.delete(message.requestId);
        resolver!(message.granted);
      }
      return true;
  }

  return false;
}