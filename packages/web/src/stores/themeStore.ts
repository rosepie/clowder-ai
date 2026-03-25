import { create } from 'zustand';

export type ThemeType = 'default' | 'business';

export interface ThemeConfig {
  sidebar: {
    bg: string;
    selectedItemBg?: string;
  };
  content: {
    bg: string;
  };
  header?: {
    bg: string;
  };
  footer?: {
    bg: string;
  };
}

const THEME_STORAGE_KEY = 'clowder-ai-theme';

const THEME_CONFIGS: Record<ThemeType, ThemeConfig> = {
  default: {
    sidebar: {
      bg: '', // 默认样式
    },
    content: {
      bg: '', // 默认样式
    },
  },
  business: {
    sidebar: {
      bg: 'rgb(245,245,247)',
      selectedItemBg: 'white',
    },
    content: {
      bg: 'white',
    },
    header: {
      bg: 'white',
    },
    footer: {
      bg: 'white',
    },
  },
};

interface ThemeStore {
  theme: ThemeType;
  isLoaded: boolean;
  config: ThemeConfig;
  setTheme: (theme: ThemeType) => void;
  toggleTheme: () => void;
  initializeTheme: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: 'default',
  isLoaded: false,
  config: THEME_CONFIGS['default'],

  setTheme: (newTheme: ThemeType) => {
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    set({
      theme: newTheme,
      config: THEME_CONFIGS[newTheme],
    });
  },

  toggleTheme: () => {
    const { theme } = get();
    const newTheme = theme === 'default' ? 'business' : 'default';
    get().setTheme(newTheme);
  },

  initializeTheme: () => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as ThemeType | null;
    const theme = savedTheme && (savedTheme === 'default' || savedTheme === 'business') ? savedTheme : 'default';
    set({
      theme,
      config: THEME_CONFIGS[theme],
      isLoaded: true,
    });
  },
}));
