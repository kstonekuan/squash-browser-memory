// Get URL parameters
const params = new URLSearchParams(window.location.search);
const appName = params.get('appName') || 'Unknown Application';
const domain = params.get('domain') || 'unknown';
const requestId = params.get('requestId');

// Update UI with app info
document.getElementById('appName').textContent = appName;
document.getElementById('domain').textContent = domain;

// Handle allow button
document.getElementById('allowBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ 
    type: 'PERMISSION_RESPONSE', 
    granted: true,
    requestId: requestId
  });
  window.close();
});

// Handle deny button
document.getElementById('denyBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ 
    type: 'PERMISSION_RESPONSE', 
    granted: false,
    requestId: requestId
  });
  window.close();
});

// Handle escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('denyBtn').click();
  }
});