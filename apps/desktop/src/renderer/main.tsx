import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';
import { initE2ETestHooks } from './e2e-test-hooks';

// Initialize E2E test hooks if running in test mode
initE2ETestHooks();

// Check for code editor window route
const isCodeEditorWindow = window.location.hash === '#/code-editor';
const isGenUIWindow = window.location.hash === '#/genui';

// Lazy load CodeEditorApp only when needed
const CodeEditorApp = React.lazy(() => import('./CodeEditorApp'));
const GenUIApp = React.lazy(() => import('./GenUIApp'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isCodeEditorWindow ? (
      <React.Suspense fallback={
        <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">Loading CodeEditor...</span>
          </div>
        </div>
      }>
        <CodeEditorApp />
      </React.Suspense>
    ) : isGenUIWindow ? (
      <React.Suspense fallback={
        <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">Loading Generative UI...</span>
          </div>
        </div>
      }>
        <GenUIApp />
      </React.Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
