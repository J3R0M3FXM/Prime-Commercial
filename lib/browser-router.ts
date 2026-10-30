'use client';

function navigate(path: string, replace: boolean) {
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRouter() {
  return {
    push: (path: string) => navigate(path, false),
    replace: (path: string) => navigate(path, true),
  };
}
