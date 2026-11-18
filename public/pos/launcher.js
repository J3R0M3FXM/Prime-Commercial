(() => {
  const install = document.getElementById('install');
  const help = document.getElementById('install-help');
  const status = document.getElementById('status');
  const installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let pendingInstall;
  if (installed) help.hidden = true;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingInstall = event;
    if (!installed) install.hidden = false;
  });
  install.addEventListener('click', async () => {
    if (!pendingInstall) return;
    const prompt = pendingInstall;
    pendingInstall = undefined;
    install.hidden = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') help.textContent = 'Installed. Tap PRIME POS in your apps to open the register.';
    } catch { help.hidden = false; }
  });
  window.addEventListener('appinstalled', () => {
    pendingInstall = undefined;
    install.hidden = true;
    help.textContent = 'Installed. Tap PRIME POS in your apps to open the register.';
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/pos/worker.js', {scope:'/pos/'}).catch(() => {});
  }
  // Attempt once per launch. The visible button supports browsers requiring a tap.
  if (installed || new URLSearchParams(window.location.search).get('launch') === '1') {
    status.textContent = 'Opening POS in Telegram… If it does not open, tap Open POS.';
    try { window.location.assign(document.getElementById('open-pos').href); } catch {}
  }
})();
