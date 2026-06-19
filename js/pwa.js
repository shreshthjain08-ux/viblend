window.PWA = {
  deferredPrompt: null,

  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          console.log('SW registered:', reg.scope);
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                window.UI.showToast('Update available! Refresh to update.', 5000);
              }
            });
          });
        })
        .catch(err => console.log('SW registration failed:', err));
    }
  },

  showInstallPrompt() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') console.log('User installed PWA');
        this.deferredPrompt = null;
      });
    }
  },

  init() {
    this.registerSW();
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
    });
    window.addEventListener('appinstalled', () => {
      console.log('PWA installed');
      this.deferredPrompt = null;
    });
    window.addEventListener('online', () => window.UI.hideOfflineBanner());
    window.addEventListener('offline', () => window.UI.showOfflineBanner());
  },

  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  },

  getPWADisplayMode() {
    if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
    if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone';
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui';
    return 'browser';
  }
};

window.PWA.init();
