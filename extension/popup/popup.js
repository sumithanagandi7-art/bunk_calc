/**
 * Popup Script for Bunk Calculator Sync Chrome Extension
 */

document.addEventListener('DOMContentLoaded', () => {
  const serverDot = document.getElementById('server-dot');
  const serverText = document.getElementById('server-text');
  const accessCodeInput = document.getElementById('access-code-input');
  const saveCodeBtn = document.getElementById('save-code-btn');
  const syncBtn = document.getElementById('sync-btn');
  const syncBtnText = document.getElementById('sync-btn-text');
  const tabStatus = document.getElementById('tab-status');
  const lastSyncTime = document.getElementById('last-sync-time');
  const subjectsContainer = document.getElementById('subjects-container');
  const subjectCountPill = document.getElementById('subject-count');
  const openDashboardLink = document.getElementById('open-dashboard-link');

  // Format date time into relative or readable string
  function formatTime(isoStr) {
    if (!isoStr) return 'Never';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return 'Never';

    const diffSecs = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSecs < 60) return 'Just now';
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // Render subject cards in popup
  function renderSubjects(subjects = []) {
    subjectCountPill.textContent = subjects.length;

    if (!subjects || subjects.length === 0) {
      subjectsContainer.innerHTML = `
        <div class="empty-state">
          <p>No subjects synced yet.</p>
          <p class="sub-text">Open your college portal & click "Sync Portal Attendance".</p>
        </div>
      `;
      return;
    }

    subjectsContainer.innerHTML = subjects.map(s => {
      const calc = s.bunk_calculations?.find(c => c.checkpoint === 'mse1') || s.bunk_calculations?.[0];
      const pct = calc ? Math.round(calc.current_percentage || 0) : 0;
      const status = calc ? calc.status : (pct >= 75 ? 'safe' : pct >= 60 ? 'tight' : 'at_risk');
      const attended = calc ? calc.classes_attended : 0;
      const total = calc ? calc.classes_total : (s.total_classes_planned || 0);

      const pctClass = status === 'safe' ? 'pct-safe' : status === 'tight' ? 'pct-tight' : 'pct-risk';
      const statusLabel = status === 'safe' ? 'SAFE' : status === 'tight' ? 'TIGHT' : 'AT RISK';

      return `
        <div class="subject-item">
          <div class="sub-left">
            <span class="sub-code">${s.subject_code}</span>
            <span class="sub-name" title="${s.subject_name}">${s.subject_name}</span>
            <span class="sub-counts">${attended} / ${total} Classes Attended</span>
          </div>
          <div class="sub-right">
            <span class="pct-badge ${pctClass}">${pct}%</span>
            <span class="status-tag" style="color: ${status === 'safe' ? '#34D399' : status === 'tight' ? '#FBBF24' : '#F87171'}">${statusLabel}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Load status data from background worker
  function loadStatus() {
    chrome.runtime.sendMessage({ action: 'GET_STATUS_DATA' }, (res) => {
      if (chrome.runtime.lastError || !res) {
        serverDot.className = 'status-dot offline';
        serverText.textContent = 'Offline';
        return;
      }

      if (res.isServerOnline) {
        serverDot.className = 'status-dot online';
        serverText.textContent = 'BunkCalc Online';
      } else {
        serverDot.className = 'status-dot offline';
        serverText.textContent = 'Server Offline';
      }

      if (res.accessCode && res.accessCode !== 'Not Set') {
        accessCodeInput.value = res.accessCode;
      }

      lastSyncTime.textContent = `Last synced: ${formatTime(res.lastSyncedAt)}`;
      renderSubjects(res.subjects || []);
    });

    // Check active tab domain
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        const url = tabs[0].url;
        if (url.includes('contineo') || url.includes('attendance') || url.includes('nitte') || url.includes('portal')) {
          tabStatus.textContent = '✓ Recognized Portal Page';
          tabStatus.style.color = '#34D399';
        } else {
          tabStatus.textContent = 'Open college portal to sync';
          tabStatus.style.color = '#9CA3AF';
        }
      }
    });
  }

  // Save access code
  saveCodeBtn.addEventListener('click', () => {
    const code = accessCodeInput.value.trim();
    if (!code) return;

    saveCodeBtn.disabled = true;
    saveCodeBtn.textContent = 'Connecting...';

    chrome.runtime.sendMessage({ action: 'UPDATE_ACCESS_CODE', accessCode: code }, (res) => {
      saveCodeBtn.disabled = false;
      saveCodeBtn.textContent = 'Connect';

      if (res && res.success) {
        loadStatus();
      } else {
        alert(res?.error || 'Could not connect with access code.');
      }
    });
  });

  // Sync button handler
  syncBtn.addEventListener('click', () => {
    syncBtn.disabled = true;
    syncBtnText.textContent = 'Extracting & Syncing...';

    chrome.runtime.sendMessage({ action: 'TRIGGER_PORTAL_SYNC' }, (res) => {
      syncBtn.disabled = false;
      syncBtnText.textContent = 'Sync Portal Attendance';

      if (res && res.success) {
        loadStatus();
      } else {
        alert(res?.error || 'Failed to sync. Make sure you are logged into your college portal.');
      }
    });
  });

  // Initial load
  loadStatus();
});
