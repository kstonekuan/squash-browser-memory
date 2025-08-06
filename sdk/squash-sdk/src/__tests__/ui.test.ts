import { UIManager } from '../ui';

describe('UIManager', () => {
  let uiManager: UIManager;

  beforeEach(() => {
    uiManager = new UIManager();
    // Clear DOM
    document.body.innerHTML = '';
    // Clear sessionStorage
    sessionStorage.clear();
  });

  describe('showInstallPrompt()', () => {
    it('should create and display install prompt', () => {
      uiManager.showInstallPrompt();
      
      const prompt = document.getElementById('squash-install-prompt');
      expect(prompt).toBeTruthy();
    });

    it('should use custom title and message', () => {
      uiManager.showInstallPrompt({
        title: 'Custom Title',
        message: 'Custom Message'
      });
      
      const prompt = document.getElementById('squash-install-prompt');
      expect(prompt?.textContent).toContain('Custom Title');
      expect(prompt?.textContent).toContain('Custom Message');
    });

    it('should apply light theme', () => {
      uiManager.showInstallPrompt({ theme: 'light' });
      
      const prompt = document.getElementById('squash-install-prompt');
      expect(prompt).toBeTruthy();
      // Check that light theme styles are applied
      const styles = prompt?.querySelector('style')?.textContent;
      expect(styles).toContain('background: #ffffff');
    });

    it('should apply dark theme', () => {
      uiManager.showInstallPrompt({ theme: 'dark' });
      
      const prompt = document.getElementById('squash-install-prompt');
      expect(prompt).toBeTruthy();
      // Check that dark theme styles are applied
      const styles = prompt?.querySelector('style')?.textContent;
      expect(styles).toContain('background: #1e1e1e');
    });

    it('should detect system theme when auto', () => {
      // Mock matchMedia for dark mode
      const mockMatchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));
      
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockMatchMedia
      });

      uiManager.showInstallPrompt({ theme: 'auto' });
      
      const prompt = document.getElementById('squash-install-prompt');
      const styles = prompt?.querySelector('style')?.textContent;
      expect(styles).toContain('background: #1e1e1e'); // Should be dark
    });

    it('should position prompt at bottom by default', () => {
      uiManager.showInstallPrompt();
      
      const prompt = document.getElementById('squash-install-prompt');
      const styles = prompt?.querySelector('style')?.textContent;
      expect(styles).toContain('bottom: 20px');
    });

    it('should position prompt at top when specified', () => {
      uiManager.showInstallPrompt({ position: 'top' });
      
      const prompt = document.getElementById('squash-install-prompt');
      const styles = prompt?.querySelector('style')?.textContent;
      expect(styles).toContain('top: 20px');
    });

    it('should position prompt at center when specified', () => {
      uiManager.showInstallPrompt({ position: 'center' });
      
      const prompt = document.getElementById('squash-install-prompt');
      const styles = prompt?.querySelector('style')?.textContent;
      expect(styles).toContain('top: 50%');
      expect(styles).toContain('transform: translateY(-50%)');
    });

    it('should hide prompt when close button is clicked', () => {
      uiManager.showInstallPrompt();
      
      const closeButton = document.querySelector('.close-btn') as HTMLElement;
      closeButton?.click();
      
      const prompt = document.getElementById('squash-install-prompt');
      expect(prompt).toBeFalsy();
    });

    it('should hide prompt when dismiss button is clicked', () => {
      uiManager.showInstallPrompt();
      
      const dismissButton = document.querySelector('.dismiss-btn') as HTMLElement;
      dismissButton?.click();
      
      const prompt = document.getElementById('squash-install-prompt');
      expect(prompt).toBeFalsy();
    });

    it('should set dismissed flag in sessionStorage when dismissed', () => {
      uiManager.showInstallPrompt();
      
      const dismissButton = document.querySelector('.dismiss-btn') as HTMLElement;
      dismissButton?.click();
      
      expect(sessionStorage.getItem('squash-prompt-dismissed')).toBe('true');
    });

    it('should open extension store when install button is clicked', () => {
      const openSpy = jest.spyOn(window, 'open').mockImplementation();
      
      uiManager.showInstallPrompt();
      
      const installButton = document.querySelector('.install-btn') as HTMLElement;
      installButton?.click();
      
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('chromewebstore.google.com'),
        '_blank'
      );
      
      openSpy.mockRestore();
    });

    it('should hide prompt after install button is clicked', () => {
      jest.spyOn(window, 'open').mockImplementation();
      
      uiManager.showInstallPrompt();
      
      const installButton = document.querySelector('.install-btn') as HTMLElement;
      installButton?.click();
      
      const prompt = document.getElementById('squash-install-prompt');
      expect(prompt).toBeFalsy();
    });

    it('should not show duplicate prompts', () => {
      uiManager.showInstallPrompt();
      uiManager.showInstallPrompt();
      
      const prompts = document.querySelectorAll('#squash-install-prompt');
      expect(prompts.length).toBe(1);
    });
  });

  describe('hideInstallPrompt()', () => {
    it('should remove the prompt from DOM', () => {
      uiManager.showInstallPrompt();
      uiManager.hideInstallPrompt();
      
      const prompt = document.getElementById('squash-install-prompt');
      expect(prompt).toBeFalsy();
    });

    it('should do nothing if prompt does not exist', () => {
      expect(() => uiManager.hideInstallPrompt()).not.toThrow();
    });
  });

  describe('isPromptDismissed()', () => {
    it('should return false when not dismissed', () => {
      expect(uiManager.isPromptDismissed()).toBe(false);
    });

    it('should return true when dismissed flag is set', () => {
      sessionStorage.setItem('squash-prompt-dismissed', 'true');
      expect(uiManager.isPromptDismissed()).toBe(true);
    });

    it('should only remember dismissal for current session', () => {
      // Set in sessionStorage (not localStorage)
      sessionStorage.setItem('squash-prompt-dismissed', 'true');
      expect(uiManager.isPromptDismissed()).toBe(true);
      
      // Clear sessionStorage simulates new session
      sessionStorage.clear();
      expect(uiManager.isPromptDismissed()).toBe(false);
    });
  });
});