import { create } from 'zustand';

interface SidebarState {
  isCollapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
  getSidebarWidth: (isKuroryuu: boolean) => number;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  isCollapsed: (() => {
    try {
      const stored = localStorage.getItem('kuroryuu-sidebar-collapsed');
      return stored === 'true';
    } catch {
      return false;
    }
  })(),

  setCollapsed: (collapsed) => {
    localStorage.setItem('kuroryuu-sidebar-collapsed', String(collapsed));
    set({ isCollapsed: collapsed });
  },

  toggle: () => {
    const current = get().isCollapsed;
    get().setCollapsed(!current);
  },

  getSidebarWidth: (isKuroryuu) => {
    const base = get().isCollapsed ? 48 : 208;
    // Add pillar width (24px × 2 = 48px) when expanded with Kuroryuu theme
    // Pillars are w-6 = 1.5rem = 24px each
    return isKuroryuu && !get().isCollapsed ? base + 48 : base;
  },
}));
