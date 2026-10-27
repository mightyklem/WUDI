import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { AuthProvider } from '../lib/auth';
import { theme } from '../lib/theme';

// Hold the splash until the font is ready, otherwise text renders in the system font
// for a frame and visibly reflows.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  // The splash carries the wordmark: hold it a beat after fonts land so the
  // brand actually registers instead of flashing past unread.
  const [beatElapsed, setBeatElapsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBeatElapsed(true), 900);
    return () => clearTimeout(t);
  }, []);

  const ready = fontsLoaded && beatElapsed;

  const onLayout = useCallback(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg, fontFamily: 'Manrope_400Regular' } as any }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="training/[id]" />
        <Stack.Screen name="classroom/[sessionId]" />
      </Stack>
    </AuthProvider>
  );
}