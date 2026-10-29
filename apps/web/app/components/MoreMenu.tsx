'use client';

import { useState } from 'react';
import Icon from '@/components/Icon';
import AIAssistant from './AIAssistant';
import ThemePicker from './ThemePicker';

/**
 * MoreMenu — one floating "More" button that opens a dropdown with:
 *
 *   • Assistant — opens the AI chat panel
 *   • Appearance — opens the theme picker (system / light / dark)
 *
 * Replaces the two separate floating buttons (Assistant FAB + Appearance FAB)
 * with a single tidy stack above the bottom navigation.
 */

export default function MoreMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  return (
    <>
      {/* The single "More" floating button — bottom right, clear of the nav bar. */}
      <button
        className="more-fab"
        aria-label={menuOpen ? 'Close options' : 'More options'}
        aria-expanded={menuOpen || assistantOpen || appearanceOpen}
        onClick={() => setMenuOpen((o) => !o)}
      >
        <Icon name="more" size={22} strokeWidth={2} />
      </button>

      {/* Dropdown menu — slides up above the FAB. Only one menu at a time. */}
      {menuOpen && (
        <div className="more-overlay" onClick={() => setMenuOpen(false)}></div>
      )}
      <div
        className={`more-menu ${menuOpen ? 'open' : ''}`}
        style={{
          bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))',
          right: '16px',
        }}
      >
        <button
          className="more-item"
          onClick={() => {
            setMenuOpen(false);
            setAssistantOpen(true);
          }}
        >
          <span className="more-item-icon">
            <Icon name="chat" size={18} strokeWidth={2} />
          </span>
          <span className="more-item-label">Assistant</span>
          <span className="more-item-arrow">→</span>
        </button>
        <button
          className="more-item"
          onClick={() => {
            setMenuOpen(false);
            setAppearanceOpen(true);
          }}
        >
          <span className="more-item-icon">
            <Icon name="monitor" size={18} strokeWidth={2} />
          </span>
          <span className="more-item-label">Appearance</span>
          <span className="more-item-arrow">→</span>
        </button>
      </div>

      {/* Assistant chat panel — opened from the Assistant menu item. */}
      <AIAssistant open={assistantOpen} onClose={() => setAssistantOpen(false)} />

      {/* Theme picker — opened from the Appearance menu item. */}
      <ThemePicker open={appearanceOpen} onClose={() => setAppearanceOpen(false)} />
    </>
  );
}
