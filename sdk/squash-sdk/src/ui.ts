/**
 * UI components for the SDK (install prompts, etc.)
 */

export interface InstallPromptOptions {
  title?: string;
  message?: string;
  theme?: 'light' | 'dark' | 'auto';
  position?: 'top' | 'bottom' | 'center';
}

export class UIManager {
  private promptElement: HTMLElement | null = null;

  showInstallPrompt(options: InstallPromptOptions = {}): void {
    // Don't show multiple prompts
    if (this.promptElement) return;

    const {
      title = 'Enhance Your AI Experience',
      message = 'Install Squash to give AI assistants context about your work',
      theme = 'auto',
      position = 'bottom'
    } = options;

    // Create prompt element
    const prompt = document.createElement('div');
    prompt.id = 'squash-install-prompt';
    
    // Detect theme
    const isDark = theme === 'dark' || 
      (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    prompt.innerHTML = `
      <style>
        #squash-install-prompt {
          position: fixed;
          ${position === 'top' ? 'top: 20px;' : position === 'bottom' ? 'bottom: 20px;' : 'top: 50%; transform: translateY(-50%);'}
          right: 20px;
          max-width: 380px;
          padding: 20px;
          background: ${isDark ? '#1e1e1e' : '#ffffff'};
          color: ${isDark ? '#ffffff' : '#1a1a1a'};
          border-radius: 12px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, ${isDark ? '0.3' : '0.1'});
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          z-index: 9999;
          animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        #squash-install-prompt h3 {
          margin: 0 0 8px 0;
          font-size: 18px;
          font-weight: 600;
        }
        
        #squash-install-prompt p {
          margin: 0 0 16px 0;
          font-size: 14px;
          line-height: 1.5;
          color: ${isDark ? '#b0b0b0' : '#666666'};
        }
        
        #squash-install-prompt .buttons {
          display: flex;
          gap: 12px;
        }
        
        #squash-install-prompt button {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        #squash-install-prompt .install-btn {
          flex: 1;
          background: #1a73e8;
          color: white;
        }
        
        #squash-install-prompt .install-btn:hover {
          background: #1557b0;
        }
        
        #squash-install-prompt .dismiss-btn {
          background: ${isDark ? '#333333' : '#f1f3f4'};
          color: ${isDark ? '#ffffff' : '#5f6368'};
        }
        
        #squash-install-prompt .dismiss-btn:hover {
          background: ${isDark ? '#444444' : '#e8eaed'};
        }
        
        #squash-install-prompt .close-btn {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 24px;
          height: 24px;
          background: none;
          border: none;
          cursor: pointer;
          opacity: 0.6;
          transition: opacity 0.2s;
        }
        
        #squash-install-prompt .close-btn:hover {
          opacity: 1;
        }
        
        #squash-install-prompt .close-btn svg {
          width: 100%;
          height: 100%;
          fill: ${isDark ? '#ffffff' : '#5f6368'};
        }
      </style>
      
      <button class="close-btn" aria-label="Close">
        <svg viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
      
      <h3>${title}</h3>
      <p>${message}</p>
      
      <div class="buttons">
        <button class="install-btn">Install Squash</button>
        <button class="dismiss-btn">Not Now</button>
      </div>
    `;

    // Add event listeners
    const installBtn = prompt.querySelector('.install-btn') as HTMLButtonElement;
    const dismissBtn = prompt.querySelector('.dismiss-btn') as HTMLButtonElement;
    const closeBtn = prompt.querySelector('.close-btn') as HTMLButtonElement;

    installBtn.addEventListener('click', () => {
      window.open('https://chromewebstore.google.com/detail/squash-browser-memory-for/cbemgpconhoibnbbgjbeengcojcoeimh', '_blank');
      this.hideInstallPrompt();
    });

    dismissBtn.addEventListener('click', () => {
      this.hideInstallPrompt();
      // Remember dismissal for this session
      sessionStorage.setItem('squash-prompt-dismissed', 'true');
    });

    closeBtn.addEventListener('click', () => {
      this.hideInstallPrompt();
    });

    // Add to page
    document.body.appendChild(prompt);
    this.promptElement = prompt;
  }

  hideInstallPrompt(): void {
    if (this.promptElement) {
      this.promptElement.remove();
      this.promptElement = null;
    }
  }

  isPromptDismissed(): boolean {
    return sessionStorage.getItem('squash-prompt-dismissed') === 'true';
  }
}