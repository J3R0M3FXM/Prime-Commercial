'use client';

function navigate(path: string, replace: boolean) {
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// Keep the router stable so effects depending on it do not restart on every render.
const router = {
  push: (path: string) => navigate(path, false),
  replace: (path: string) => navigate(path, true),
};

export function useRouter() {
  return router;
}
