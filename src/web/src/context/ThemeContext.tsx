import React from 'react'; // ^18.0.0
import { THEME } from '../lib/constants';

// Constants for theme management
const THEME_STORAGE_KEY = 'emr-task-theme-preference';
const MINIMUM_CONTRAST_RATIO = 4.5;
const THEME_TRANSITION_DURATION = 200;

// Type definitions for theme context
interface ThemeContextType {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  systemTheme: string;
  isSystemTheme: boolean;
  contrast: number;
  isHighContrast: boolean;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: 'light' | 'dark' | 'system';
  enableSystemTheme?: boolean;
}

// Create theme context with type safety
const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

// Utility functions for theme management
const calculateContrastRatio = (background: string, text: string): number => {
  const getBrightness = (color: string) => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
  };

  const bg = getBrightness(background);
  const txt = getBrightness(text);
  const contrast = (Math.max(bg, txt) + 0.05) / (Math.min(bg, txt) + 0.05);
  return Number(contrast.toFixed(2));
};

export const ThemeProvider: React.FC<ThemeProviderProps> = React.memo(({ 
  children, 
  defaultTheme = 'system',
  enableSystemTheme = true 
}) => {
  const [theme, setThemeState] = React.useState<'light' | 'dark'>('light');
  const [systemTheme, setSystemTheme] = React.useState<string>('light');
  const [contrast, setContrast] = React.useState<number>(0);
  const [isSystemTheme, setIsSystemTheme] = React.useState<boolean>(defaultTheme === 'system');

  // Initialize system theme detection
  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (isSystemTheme) {
        setThemeState(e.matches ? 'dark' : 'light');
      }
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    // Set initial system theme
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

    // Add listener for system theme changes
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [isSystemTheme]);

  // Initialize theme from localStorage or system preference
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored);
        setIsSystemTheme(false);
      } else if (enableSystemTheme) {
        setThemeState(systemTheme as 'light' | 'dark');
        setIsSystemTheme(true);
      }
    } catch (error) {
      console.error('Failed to access localStorage:', error);
    }
  }, [enableSystemTheme, systemTheme]);

  // Calculate and monitor contrast ratio
  React.useEffect(() => {
    const calculateThemeContrast = () => {
      const bgColor = theme === 'light' ? THEME.COLORS.BACKGROUND.LIGHT : THEME.COLORS.BACKGROUND.DARK;
      const textColor = theme === 'light' ? THEME.COLORS.TEXT.LIGHT : THEME.COLORS.TEXT.DARK;
      const ratio = calculateContrastRatio(bgColor, textColor);
      setContrast(ratio);
    };

    calculateThemeContrast();
  }, [theme]);

  // Apply theme to document with transition
  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-transition-duration', `${THEME_TRANSITION_DURATION}ms`);
    
    // Apply theme class with transition
    const applyTheme = () => {
      root.classList.remove('light-theme', 'dark-theme');
      root.classList.add(`${theme}-theme`);
      
      // Set theme colors as CSS variables
      Object.entries(THEME.COLORS).forEach(([key, value]) => {
        if (typeof value === 'object') {
          Object.entries(value).forEach(([shade, color]) => {
            root.style.setProperty(`--color-${key.toLowerCase()}-${shade}`, color);
          });
        }
      });
    };

    // Add transition class before theme change
    root.classList.add('theme-transition');
    applyTheme();

    // Remove transition class after animation
    const timeout = setTimeout(() => {
      root.classList.remove('theme-transition');
    }, THEME_TRANSITION_DURATION);

    return () => clearTimeout(timeout);
  }, [theme]);

  // Theme management functions
  const setTheme = React.useCallback((newTheme: 'light' | 'dark') => {
    if (newTheme === theme) return;

    try {
      // Validate contrast ratio
      const bgColor = newTheme === 'light' ? THEME.COLORS.BACKGROUND.LIGHT : THEME.COLORS.BACKGROUND.DARK;
      const textColor = newTheme === 'light' ? THEME.COLORS.TEXT.LIGHT : THEME.COLORS.TEXT.DARK;
      const newContrast = calculateContrastRatio(bgColor, textColor);

      if (newContrast < MINIMUM_CONTRAST_RATIO) {
        console.warn(`Theme contrast ratio (${newContrast}) is below WCAG AA standard (${MINIMUM_CONTRAST_RATIO})`);
      }

      // Update localStorage and state
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      setThemeState(newTheme);
      setIsSystemTheme(false);

      // Emit theme change event for analytics
      const event = new CustomEvent('themeChange', { detail: { theme: newTheme, contrast: newContrast } });
      window.dispatchEvent(event);
    } catch (error) {
      console.error('Failed to set theme:', error);
    }
  }, [theme]);

  const toggleTheme = React.useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  }, [theme, setTheme]);

  // Memoize context value
  const contextValue = React.useMemo(() => ({
    theme,
    setTheme,
    toggleTheme,
    systemTheme,
    isSystemTheme,
    contrast,
    isHighContrast: contrast >= MINIMUM_CONTRAST_RATIO
  }), [theme, setTheme, toggleTheme, systemTheme, isSystemTheme, contrast]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
});

ThemeProvider.displayName = 'ThemeProvider';

// Custom hook for accessing theme context
export const useTheme = (): ThemeContextType => {
  const context = React.useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export { ThemeContext };