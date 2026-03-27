"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

/**
 * Hook for managing theme (light/dark mode) with localStorage persistence.
 * 
 * When theme is "system", respects OS preference (prefers-color-scheme).
 * When theme is "light" or "dark", forces that mode regardless of OS preference.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("theme-preference") as Theme | null;
    if (stored && ["light", "dark", "system"].includes(stored)) {
      setThemeState(stored);
    }
    setMounted(true);
  }, []);

  // Update DOM and localStorage when theme changes
  useEffect(() => {
    if (!mounted) return;

    localStorage.setItem("theme-preference", theme);

    const html = document.documentElement;
    
    if (theme === "system") {
      // Remove forced color-scheme, let OS preference take over
      html.style.colorScheme = "";
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      html.classList.toggle("dark", isDark);
    } else {
      // Force theme
      html.style.colorScheme = theme;
      html.classList.toggle("dark", theme === "dark");
    }
  }, [theme, mounted]);

  // Listen to OS preference changes when in system mode
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      const html = document.documentElement;
      html.classList.toggle("dark", e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => {
      if (prev === "system") return "light";
      if (prev === "light") return "dark";
      return "system";
    });
  };

  return { theme, setTheme: setThemeState, toggleTheme, mounted };
}
