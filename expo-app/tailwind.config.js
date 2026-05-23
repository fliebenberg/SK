/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "#FF3E00",
          blue: "#00E5FF",
          red: "#FF003C",
          green: "#00E676",
        },
        background: "#0F172A",
        surface: "rgba(255, 255, 255, 0.05)",
        textPrimary: "#FFFFFF",
        textSecondary: "#94A3B8"
      },
      fontFamily: {
        orbitron: ["Orbitron_400Regular", "Orbitron_700Bold", "sans-serif"],
        inter: ["Inter_400Regular", "Inter_500Medium", "Inter_700Bold", "sans-serif"],
      }
    },
  },
  plugins: [],
}
