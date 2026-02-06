import React from 'react';
import { useTheme } from './hooks/useTheme';
import { GenUIPanel } from './components/genui/GenUIPanel';
import './styles/globals.css';

export default function GenUIApp() {
  useTheme();

  return <GenUIPanel />;
}
