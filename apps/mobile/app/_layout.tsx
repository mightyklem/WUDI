import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect } from 'react';
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

  const onLayout = useCallback(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

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