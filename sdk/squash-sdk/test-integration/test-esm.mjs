import { squash } from 'squash-sdk';

console.log('Testing Squash SDK (ESM)...\n');

// Test ESM import
console.log('ESM import successful!');
console.log('squash object:', typeof squash);

// Enable mock mode and test
squash.enableMockMode();

const initResult = await squash.init({
  appName: 'ESM Test App',
  appId: 'esm-test-app'
});

console.log('Init successful:', initResult.initialized);

const contextResult = await squash.getContext();
console.log('Context status:', contextResult.status);
console.log('Mock data confirmed:', contextResult.metadata.isMockData);

console.log('\n✅ ESM import working correctly!');