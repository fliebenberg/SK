import { config as defaultConfig } from '@tamagui/config/v3';
import { createTamagui, createTokens, createFont } from 'tamagui';

// Define custom heading font that resolves to Orbitron
const headingFont = createFont({
  family: 'OrbitronBold',
  size: defaultConfig.fonts.heading.size,
  lineHeight: defaultConfig.fonts.heading.lineHeight,
  weight: defaultConfig.fonts.heading.weight,
  letterSpacing: defaultConfig.fonts.heading.letterSpacing,
  face: {
    400: { normal: 'OrbitronRegular' },
    700: { normal: 'OrbitronBold' },
    900: { normal: 'OrbitronBlack' },
  }
});

// Custom design tokens extending standard ones
const tokens = createTokens({
  ...defaultConfig.tokens,
  color: {
    ...defaultConfig.tokens.color,
    // Custom Metal Plate Colors (Slate-based Gradients)
    metalOuterStartLight: '#94a3b8',
    metalOuterMidLight: '#cbd5e1',
    metalOuterEndLight: '#64748b',
    metalInnerStartLight: '#e2e8f0',
    metalInnerMidLight: '#cbd5e1',
    metalInnerEndLight: '#94a3b8',
    metalTextLight: '#334155',

    metalOuterStartDark: '#0f172a',
    metalOuterMidDark: '#1e293b',
    metalOuterEndDark: '#020617',
    metalInnerStartDark: '#020617',
    metalInnerMidDark: '#1e293b',
    metalInnerEndDark: '#0f172a',
    metalTextDark: '#cbd5e1',

    // Specific HSL branding colors
    primaryGreen: 'hsl(142, 70%, 50%)',
    primaryOrange: 'hsl(24, 95%, 53%)',
  },
  size: {
    ...defaultConfig.tokens.size,
    // Add extra tiny sizes for super dense sports scoring layouts
    '2tiny': 9,
    '3tiny': 8,
    '4tiny': 7,
    '5tiny': 6,
    tiny: 10,
    'tiny-lg': 11,
    small: 12,
  }
});

// Define custom theme overrides mapping Light/Dark Green/Orange
const themes = {
  ...defaultConfig.themes,
  light_green: {
    ...defaultConfig.themes.light,
    background: 'hsl(0, 0%, 100%)',
    color: 'hsl(0, 0%, 3.9%)',
    primary: 'hsl(0, 0%, 9%)',
    border: 'hsl(0, 0%, 89.8%)',
    success: 'hsl(142.1, 76.2%, 36.3%)',
    metalOuterStart: '#94a3b8',
    metalOuterMid: '#cbd5e1',
    metalOuterEnd: '#64748b',
    metalInnerStart: '#e2e8f0',
    metalInnerMid: '#cbd5e1',
    metalInnerEnd: '#94a3b8',
    metalText: '#334155',
  },
  light_orange: {
    ...defaultConfig.themes.light,
    background: 'hsl(0, 0%, 100%)',
    color: 'hsl(240, 10%, 3.9%)',
    primary: 'hsl(24, 95%, 53%)',
    border: 'hsl(240, 5.9%, 90%)',
    success: 'hsl(142.1, 76.2%, 36.3%)',
    metalOuterStart: '#94a3b8',
    metalOuterMid: '#cbd5e1',
    metalOuterEnd: '#64748b',
    metalInnerStart: '#e2e8f0',
    metalInnerMid: '#cbd5e1',
    metalInnerEnd: '#94a3b8',
    metalText: '#334155',
  },
  dark_green: {
    ...defaultConfig.themes.dark,
    background: 'hsl(240, 10%, 3.9%)',
    color: 'hsl(0, 0%, 98%)',
    primary: 'hsl(142, 70%, 50%)',
    border: 'hsl(240, 3.7%, 15.9%)',
    success: 'hsl(142, 70%, 50%)',
    metalOuterStart: '#0f172a',
    metalOuterMid: '#1e293b',
    metalOuterEnd: '#020617',
    metalInnerStart: '#020617',
    metalInnerMid: '#1e293b',
    metalInnerEnd: '#0f172a',
    metalText: '#cbd5e1',
  },
  dark_orange: {
    ...defaultConfig.themes.dark,
    background: 'hsl(240, 10%, 3.9%)',
    color: 'hsl(0, 0%, 98%)',
    primary: 'hsl(24, 95%, 53%)',
    border: 'hsl(240, 3.7%, 15.9%)',
    success: 'hsl(142, 70%, 50%)',
    metalOuterStart: '#0f172a',
    metalOuterMid: '#1e293b',
    metalOuterEnd: '#020617',
    metalInnerStart: '#020617',
    metalInnerMid: '#1e293b',
    metalInnerEnd: '#0f172a',
    metalText: '#cbd5e1',
  }
};

const config = createTamagui({
  ...defaultConfig,
  fonts: {
    ...defaultConfig.fonts,
    heading: headingFont,
  },
  tokens,
  themes,
});

export type Conf = typeof config;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}

export default config;
