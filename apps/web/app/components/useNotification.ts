'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Simple notification hook with a beep sound.
 * 
 * Ensures notifications fire only once (not double) and plays a simple beep.
 * Uses Web Audio API for a simple beep sound.
 */
export function useNotification() {
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasShownRef = useRef<Set<string>>(new Set());

  // Initialize AudioContext on first user interaction
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        // Audio not supported
      }
    }
  }, []);

  // Play a simple beep sound
  const playBeep = useCallback((type: 'info' | 'success' | 'error' = 'info') => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // Different frequencies for different types
      switch (type) {
        case 'success':
          oscillator.frequency.setValueAtTime(800, ctx.currentTime);
          oscillator.frequency.setValueAtTime(1000, ctx.currentTime + 0.1);
          break;
        case 'error':
          oscillator.frequency.setValueAtTime(300, ctx.currentTime);
          oscillator.frequency.setValueAtTime(200, ctx.currentTime + 0.15);
          break;
        case 'info':
        default:
          oscillator.frequency.setValueAtTime(600, ctx.currentTime);
          oscillator.frequency.setValueAtTime(800, ctx.currentTime + 0.1);
          break;
      }
      
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio failed silently
    }
  }, []);

const showNotification = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info', duration = 3000) => {
    // Generate a unique key for this notification
    const key = `${type}:${message}`;
    
    // Prevent duplicate notifications (the "double nudge" issue)
    if (hasShownRef.current.has(key)) {
      return;
    }
    hasShownRef.current.add(key);
    
    // Clean up old keys periodically
    if (hasShownRef.current.size > 50) {
      const firstKey = hasShownRef.current.values().next().value;
      if (firstKey) hasShownRef.current.delete(firstKey);
    }

    // Play beep sound
    playBeep('info');
    
    setNotification({ message, type });
    
    // Auto-dismiss after duration
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    const notificationKey = key;
    notificationTimeoutRef.current = setTimeout(() => {
      setNotification(null);
      hasShownRef.current.delete(notificationKey);
    }, duration);
  }, []);

  const hideNotification = useCallback(() => {
    setNotification(null);
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
      notificationTimeoutRef.current = null;
    }
  }, []);

  // Initialize audio on first user interaction
  useEffect(() => {
    const initAudio = () => {
      initAudioContext();
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('keydown', initAudio, { once: true });
    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    notification,
    showNotification,
    hideNotification,
  };
}