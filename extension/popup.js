document.querySelector('#open-speak').addEventListener('click', () => {
  void chrome.tabs.create({ url: 'https://speakrecorder.vercel.app/app' });
});
