import { useEffect } from 'react';
import { useThemeStore, type ThemeType, type ThemeConfig } from '@/stores/themeStore';

export type { ThemeType, ThemeConfig };

export function useTheme() {
  const { theme, config, setTheme, toggleTheme, isLoaded, initializeTheme } = useThemeStore();

  // 初始化主题 - 从 localStorage 读取
  useEffect(() => {
    if (!isLoaded) {
      initializeTheme();
    }
  }, [isLoaded, initializeTheme]);

  return {
    theme,
    setTheme,
    toggleTheme,
    config,
    isLoaded,
  };
}
