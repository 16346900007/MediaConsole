import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import { AppContainer } from '@lark-apaas/client-toolkit/components/AppContainer';
import { ErrorRender } from '@lark-apaas/client-toolkit/components/ErrorRender';

import RoutesComponent from './app.tsx';
import './index.css';
import { createPortal } from 'react-dom';
import { Toaster } from '@client/src/components/ui/sonner';

const CLIENT_BASE_PATH = process.env.CLIENT_BASE_PATH || '/';

// 桌面容器会用宿主 appName 覆盖 <title>（AppContainer 的 useAppInfo 在挂载后
// 把 document.title 设为宿主应用名），这里用 MutationObserver 兜底强制回品牌名。
const setAppTitle = () => {
  document.title = 'MediaConsole';
};
setAppTitle();
const titleEl = document.querySelector('title');
if (titleEl) {
  const obs = new MutationObserver(() => {
    if (document.title !== 'MediaConsole') document.title = 'MediaConsole';
  });
  obs.observe(titleEl, { childList: true, subtree: true, characterData: true });
}

try {
  // 该 key 为宿主容器协议值（关闭其「由平台创建」引导），不可改名
  window.localStorage.setItem('miaoda-creatByMiaodo-has-closed-', 'true');
} catch {
  /* 忽略 */
}

const MainApp = () => {
  return (
    <BrowserRouter basename={CLIENT_BASE_PATH}>
      <AppContainer defaultTheme="light">
        <ErrorBoundary
          fallbackRender={({ error, resetErrorBoundary }) => (
            <ErrorRender
              error={error as Error}
              resetErrorBoundary={resetErrorBoundary}
            />
          )}
        >
          <RoutesComponent />
          {createPortal(<Toaster />, document.body)}
        </ErrorBoundary>
      </AppContainer>
    </BrowserRouter>
  );
};

createRoot(document.getElementById('root')!).render(<MainApp />);
