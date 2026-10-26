/**
 * Content Script for Bunk Calculator Sync extension.
 * Executes on portal pages, parses DOM table data, and communicates with background worker.
 */

(function () {
  console.log('[BunkCalc Sync] Content Script initialized.');

  // Inject a subtle floating "Sync to BunkCalc" banner button if an attendance table is detected
  function injectFloatingSyncBadge() {
    if (document.getElementById('bunkcalc-sync-badge')) return;

    const result = window.PortalParserV1 ? window.PortalParserV1.parseDocument(document) : null;
    if (!result || !result.success || result.subjects.length === 0) return;

    const badge = document.createElement('div');
    badge.id = 'bunkcalc-sync-badge';
    badge.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: linear-gradient(135deg, #6C63FF 0%, #00D2FF 100%);
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 16px;
      font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 700;
      box-shadow: 0 10px 25px rgba(108, 99, 255, 0.4), 0 0 0 1px rgba(255,255,255,0.2);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(10px);
    `;

    badge.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
        <path d="M6 12v5c3 3 9 3 12 0v-5"/>
      </svg>
      <span>Sync to BunkCalc (${result.subjects.length} Subjects)</span>
    `;

    badge.addEventListener('mouseover', () => {
      badge.style.transform = 'translateY(-3px) scale(1.03)';
      badge.style.boxShadow = '0 15px 30px rgba(108, 99, 255, 0.6)';
    });

    badge.addEventListener('mouseout', () => {
      badge.style.transform = 'translateY(0) scale(1)';
      badge.style.boxShadow = '0 10px 25px rgba(108, 99, 255, 0.4)';
    });

    badge.addEventListener('click', () => {
      badge.innerHTML = `<span>Syncing...</span>`;
      chrome.runtime.sendMessage({ action: 'TRIGGER_PORTAL_SYNC' }, (response) => {
        if (chrome.runtime.lastError) {
          badge.style.background = '#EF4444';
          badge.innerHTML = `<span>Sync Failed (Check BunkCalc Server)</span>`;
          setTimeout(() => injectFloatingSyncBadge(), 3000);
          return;
        }
        if (response && response.success) {
          badge.style.background = '#10B981';
          badge.innerHTML = `<span>✓ Synced ${response.count} Subjects!</span>`;
          setTimeout(() => badge.remove(), 4000);
        } else {
          badge.style.background = '#F59E0B';
          badge.innerHTML = `<span>${response?.error || 'Sync Error'}</span>`;
          setTimeout(() => injectFloatingSyncBadge(), 3000);
        }
      });
    });

    document.body.appendChild(badge);
  }

  // Listen for messages from background service worker or popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'SCRAPE_ATTENDANCE') {
      const parsed = window.PortalParserV1 ? window.PortalParserV1.parseDocument(document) : { success: false, error: 'Parser module not loaded' };
      parsed.portal_url = window.location.href;
      sendResponse(parsed);
    }
    return true;
  });

  // Attempt floating badge injection after DOM is loaded
  setTimeout(injectFloatingSyncBadge, 1500);
})();
