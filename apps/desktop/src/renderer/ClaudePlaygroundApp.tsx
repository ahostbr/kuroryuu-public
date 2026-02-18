import React, { useEffect } from 'react';
import { useTheme } from './hooks/useTheme';
import { useSettingsStore } from './stores/settings-store';
import { PlaygroundPanel } from './components/playground/PlaygroundPanel';
import './styles/globals.css';

export default function ClaudePlaygroundApp() {
  useTheme();

  // Load ALL persisted settings from electron-store (same as App.tsx)
  useEffect(() => {
    useSettingsStore.getState().loadSettings();
  }, []);

  return <PlaygroundPanel />;
}
