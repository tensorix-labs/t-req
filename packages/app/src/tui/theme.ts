import { RGBA } from '@opentui/core';

export const theme = {
  // Backgrounds (dark steps)
  background: '#0a0a0a', // darkStep1 - main bg
  backgroundPanel: '#141414', // darkStep2 - panels
  backgroundElement: '#1e1e1e', // darkStep3 - elements/cards
  backgroundMenu: '#282828', // darkStep4 - menus/hover

  // Text
  text: '#eeeeee', // darkStep12 - primary text
  textMuted: '#808080', // darkStep11 - secondary/hints

  // Accent colors
  primary: '#fab283', // darkStep9 - orange/peach (labels, active)
  secondary: '#5c9cf5', // blue - selection highlight
  accent: '#9d7cd8', // purple - accents

  // Status
  success: '#7fd88f', // green
  warning: '#f5a742', // orange
  error: '#e06c75', // red
  info: '#56b6c2', // cyan

  // Borders
  border: '#484848', // darkStep7
  borderActive: '#606060', // darkStep8
  borderSubtle: '#3c3c3c' // darkStep6
} as const;

export type Theme = typeof theme;

export function rgba(hex: string): RGBA {
  return RGBA.fromHex(hex);
}

export function getMethodColor(method: string): string {
  const normalized = method.toUpperCase();
  switch (normalized) {
    case 'GET':
      return theme.info;
    case 'POST':
      return theme.success;
    case 'PUT':
    case 'PATCH':
      return theme.warning;
    case 'DELETE':
      return theme.error;
    default:
      return theme.textMuted;
  }
}
