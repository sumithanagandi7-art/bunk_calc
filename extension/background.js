/**
 * Background Service Worker for Bunk Calculator Sync Chrome Extension (Manifest V3)
 */

const DEFAULT_API_URL = 'http://localhost:4000/api/v1';

// Helper: Get API URL from storage or default
async function getApiUrl() {
  const data = await chrome.storage.local.get(['apiUrl']);
  return data.apiUrl || DEFAULT_API_URL;
}

// Helper: Get Auth Token from storage
async function getAuthToken() {
  const data = await chrome.storage.local.get(['authToken']);
  return data.authToken || null;
}

// Auto-authenticate or fetch token if access_code exists
async function ensureAuthenticated() {
  let token = await getAuthToken();
  if (token) return token;

  const storage = await chrome.storage.local.get(['accessCode']);
  const accessCode = storage.accessCode || 'BUNK-DEMO';
  const apiUrl = await getApiUrl();

  try {
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_code: accessCode })
    });
    
    let data = await res.json();
    if (!res.ok) {
      // Try workspace creation if code doesn't exist
      const createRes = await fetch(`${apiUrl}/auth/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_code: accessCode })
      });
      data = await createRes.json();
    }

    if (data.token) {
      await chrome.storage.local.set({ authToken: data.token, accessCode });
      return data.token;
    }
  } catch (err) {
    console.error('[BunkCalc Background] Auth error:', err);
  }

  return null;
}

// Sync portal payload to BunkCalc backend API
async function syncPortalPayload(payload) {
  const apiUrl = await getApiUrl();
  const token = await ensureAuthenticated();

  if (!token) {
    // Queue offline if token/server unavailable
    await queueOfflineSync(payload);
    return { success: false, error: 'BunkCalc server offline or access code not configured. Batch queued locally.' };
  }

  try {
    const res = await fetch(`${apiUrl}/attendance/portal-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data.error || 'Server error during portal sync.' };
    }

    // Save latest sync timestamp & cached subjects
    await chrome.storage.local.set({
      lastSyncedAt: new Date().toISOString(),
      cachedSubjects: data.subjects || [],
      lastPortalInfo: data.portal_info || null
    });

    // Flush any offline queue
    flushOfflineQueue();

    return {
      success: true,
      count: data.synced_subjects_count || (payload.subjects ? payload.subjects.length : 0),
      subjects: data.subjects
    };
  } catch (err) {
    console.error('[BunkCalc Background] Sync fetch error:', err);
    await queueOfflineSync(payload);
    return { success: false, error: 'Network error connecting to BunkCalc server. Scraped batch queued.' };
  }
}

// Queue offline payload
async function queueOfflineSync(payload) {
  const data = await chrome.storage.local.get(['offlineQueue']);
  const queue = data.offlineQueue || [];
  queue.push({ payload, queuedAt: new Date().toISOString() });
  await chrome.storage.local.set({ offlineQueue: queue });
}

// Flush offline queue when re-connected
async function flushOfflineQueue() {
  const data = await chrome.storage.local.get(['offlineQueue']);
  const queue = data.offlineQueue || [];
  if (queue.length === 0) return;

  const token = await getAuthToken();
  const apiUrl = await getApiUrl();
  if (!token) return;

  const remaining = [];
  for (const item of queue) {
    try {
      const res = await fetch(`${apiUrl}/attendance/portal-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(item.payload)
      });
      if (!res.ok) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }

  await chrome.storage.local.set({ offlineQueue: remaining });
}

// Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'TRIGGER_PORTAL_SYNC') {
    // Query active tab for parsed portal content
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) {
        sendResponse({ success: false, error: 'No active portal tab found.' });
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { action: 'SCRAPE_ATTENDANCE' }, async (scrapedData) => {
        if (chrome.runtime.lastError || !scrapedData || !scrapedData.success) {
          sendResponse({
            success: false,
            error: scrapedData?.error || 'Could not parse attendance table on active tab. Make sure you are on your college portal\'s attendance page.'
          });
          return;
        }

        const result = await syncPortalPayload({
          portal_url: scrapedData.portal_url || tabs[0].url,
          portal_name: scrapedData.portal_name || 'College Portal',
          subjects: scrapedData.subjects
        });

        sendResponse(result);
      });
    });
    return true; // Keep channel open for async response
  }

  if (message.action === 'GET_STATUS_DATA') {
    (async () => {
      const apiUrl = await getApiUrl();
      const token = await getAuthToken();
      const storage = await chrome.storage.local.get(['accessCode', 'lastSyncedAt', 'cachedSubjects', 'offlineQueue']);
      
      let subjects = storage.cachedSubjects || [];
      let isServerOnline = false;

      if (token) {
        try {
          const res = await fetch(`${apiUrl}/subjects`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            subjects = data.subjects || subjects;
            isServerOnline = true;
            await chrome.storage.local.set({ cachedSubjects: subjects });
          }
        } catch (_) {}
      }

      sendResponse({
        accessCode: storage.accessCode || 'Not Set',
        lastSyncedAt: storage.lastSyncedAt || null,
        subjects,
        isServerOnline,
        queuedBatches: storage.offlineQueue ? storage.offlineQueue.length : 0,
        apiUrl
      });
    })();
    return true;
  }

  if (message.action === 'UPDATE_ACCESS_CODE') {
    (async () => {
      const { accessCode } = message;
      const apiUrl = await getApiUrl();
      try {
        const res = await fetch(`${apiUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_code: accessCode })
        });
        const data = await res.json();

        if (data.token) {
          await chrome.storage.local.set({ authToken: data.token, accessCode });
          sendResponse({ success: true, message: 'Connected to BunkCalc workspace!' });
        } else {
          // Attempt create
          const createRes = await fetch(`${apiUrl}/auth/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_code: accessCode })
          });
          const createData = await createRes.json();
          if (createData.token) {
            await chrome.storage.local.set({ authToken: createData.token, accessCode });
            sendResponse({ success: true, message: 'Created & connected new workspace!' });
          } else {
            sendResponse({ success: false, error: data.message || 'Invalid access code.' });
          }
        }
      } catch (err) {
        sendResponse({ success: false, error: 'Unable to reach BunkCalc server at ' + apiUrl });
      }
    })();
    return true;
  }
});
