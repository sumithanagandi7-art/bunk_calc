document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('api-url-input');
  const saveBtn = document.getElementById('save-btn');
  const saveStatus = document.getElementById('save-status');

  chrome.storage.local.get(['apiUrl'], (res) => {
    if (res.apiUrl) {
      apiUrlInput.value = res.apiUrl;
    }
  });

  saveBtn.addEventListener('click', () => {
    const url = apiUrlInput.value.trim();
    if (!url) return;

    chrome.storage.local.set({ apiUrl: url }, () => {
      saveStatus.textContent = 'Settings saved!';
      setTimeout(() => { saveStatus.textContent = ''; }, 2500);
    });
  });
});
