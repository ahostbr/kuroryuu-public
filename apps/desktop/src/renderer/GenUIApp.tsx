import React, { useEffect } from 'react';
import { useTheme } from './hooks/useTheme';
import { useSettingsStore } from './stores/settings-store';
import { GenUIPanel } from './components/genui/GenUIPanel';
import './styles/globals.css';

export default function GenUIApp() {
  useTheme();

  // Load ALL persisted settings from electron-store (same as App.tsx)
  useEffect(() => {
    useSettingsStore.getState().loadSettings();
  }, []);

  return <GenUIPanel />;
}
