import React, { createContext, useContext, useEffect, useState } from "react";
import { Appearance, ColorSchemeName } from "react-native";
import { Storage } from "../utils/storage";

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const THEME_KEY = "app_theme_mode";

/* -------------------------------------------------------------------------- */
/*                                   COLORS                                   */
/* -------------------------------------------------------------------------- */

const lightColors = {
  background: "#ffffff",
  card: "#f9fafb",
  cardSecondary: "#ffffff",
  border: "#e5e7eb",
  text: "#0a0a0a",
  subText: "#6a7282",
  mutedText: "#9ca3af",
  primary: "#111827",
  primarySoft: "#f3f4f6",
  danger: "#e7000b",
  input: "#f3f4f6",
  inputBorder: "#e5e7eb",
  otpBackground: "#eff6ff",
  otpBorder: "#dbeafe",
  otpPrimary: "#155dfc",
  otpTimer: "#1447e6",
  otpProgressBg: "#e5e7eb",
  iconButton: "#ffffff",
  divider: "#e5e7eb",
};

const darkColors = {
  background: "#0f172a",
  card: "#1e293b",
  cardSecondary: "#111827",
  border: "#334155",
  text: "#f1f5f9",
  subText: "#94a3b8",
  mutedText: "#64748b",
  primary: "#ffffff",
  primarySoft: "#1f2937",
  danger: "#ef4444",
  input: "#1e293b",
  inputBorder: "#334155",
  otpBackground: "#111827",
  otpBorder: "#1f2937",
  otpPrimary: "#3b82f6",
  otpTimer: "#60a5fa",
  otpProgressBg: "#1f2937",
  iconButton: "#1e293b",
  divider: "#1f2937",
};

type ThemeColors = typeof lightColors;

type ThemeContextType = {
  themeMode: ThemeMode; // User selection
  resolvedTheme: ResolvedTheme; // Actual applied theme
  setThemeMode: (mode: ThemeMode) => void;
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

/* -------------------------------------------------------------------------- */
/*                                PROVIDER                                    */
/* -------------------------------------------------------------------------- */

export const ThemeProvider = ({ children }: any) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(
    Appearance.getColorScheme() === "dark" ? "dark" : "light",
  );

  // Listen for system theme changes
  useEffect(() => {
    const listener = ({ colorScheme }: { colorScheme: ColorSchemeName }) => {
      setSystemTheme(colorScheme === "dark" ? "dark" : "light");
    };

    const subscription = Appearance.addChangeListener(listener);

    return () => subscription.remove();
  }, []);

  // Load saved preference
  useEffect(() => {
    (async () => {
      const saved = await Storage.getItemAsync(THEME_KEY);

      if (saved === "light" || saved === "dark" || saved === "system") {
        setThemeModeState(saved);
      }
    })();
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await Storage.setItemAsync(THEME_KEY, mode);
  };

  const resolvedTheme: ResolvedTheme =
    themeMode === "system" ? systemTheme : themeMode;

  const colors = resolvedTheme === "light" ? lightColors : darkColors;

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        resolvedTheme,
        setThemeMode,
        colors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

/* -------------------------------------------------------------------------- */
/*                                   HOOK                                     */
/* -------------------------------------------------------------------------- */

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
};
