'use client';

import React, { lazy, Suspense, type ComponentType } from 'react';

type DynamicOptions = {
  ssr?: boolean;
  loading?: ComponentType<any>;
};

export default function dynamic(loader: () => Promise<any>, options: DynamicOptions = {}) {
  const LazyComponent = lazy(async () => {
    const loaded = await loader();
    return { default: loaded?.default || loaded };
  });

  return function BrowserDynamicComponent(props: Record<string, unknown>) {
    const Loading = options.loading;
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
