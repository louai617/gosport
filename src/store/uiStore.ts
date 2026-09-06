"use client";

import { create } from "zustand";

/**
 * Transient shell state: which overlay is open, which sport is active in the
 * navigation, whether the demo banner has been dismissed for this session.
 *
 * Deliberately not persisted except for the banner — a page reload should
 * return the user to a clean shell.
 */
interface UiState {
  mobileNavOpen: boolean;
  searchOpen: boolean;
  sidebarOpen: boolean;
  demoBannerDismissed: boolean;

  setMobileNavOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  dismissDemoBanner: () => void;
  closeAll: () => void;
}

const BANNER_KEY = "sportgo.demoBanner.dismissed";

export const useUiStore = create<UiState>()((set) => ({
  mobileNavOpen: false,
  searchOpen: false,
  sidebarOpen: false,
  demoBannerDismissed: false,

  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  dismissDemoBanner: () => {
    try {
      sessionStorage.setItem(BANNER_KEY, "1");
    } catch {
      // Private-mode browsers can throw here; the banner simply reappears.
    }
    set({ demoBannerDismissed: true });
  },

  closeAll: () => set({ mobileNavOpen: false, searchOpen: false, sidebarOpen: false }),
}));

/** Reads the dismissal flag after mount, so SSR and hydration agree. */
export function readDemoBannerDismissed(): boolean {
  try {
    return sessionStorage.getItem(BANNER_KEY) === "1";
  } catch {
    return false;
  }
}
