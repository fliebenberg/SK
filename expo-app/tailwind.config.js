const plugin = require('tailwindcss/plugin');
const theme = require('./constants/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // The purpose-named, theme-aware colours (constants/theme.js): `text-ink-muted`, `bg-card`…
        ...theme.tailwindColors(),
      },
      fontFamily: {
        orbitron: ["Orbitron_400Regular", "sans-serif"],
        "orbitron-bold": ["Orbitron_700Bold", "sans-serif"],
        inter: ["Inter_400Regular", "sans-serif"],
        "inter-medium": ["Inter_500Medium", "sans-serif"],
        "inter-bold": ["Inter_700Bold", "sans-serif"],
      }
    },
  },
  plugins: [
    // Each token's light and dark value. NativeWind reads `:root` and `.dark:root` as the root
    // variables of the two colour schemes; on web they are ordinary CSS on `html` and `html.dark`.
    plugin(({ addBase }) => {
      addBase({ ':root': theme.cssVariables('light'), '.dark:root': theme.cssVariables('dark') });
    }),
  ],
}
