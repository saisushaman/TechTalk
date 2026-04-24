/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d10",
        card: "#14171c",
        edge: "#1f242c",
        ink: "#e7ecf3",
        mute: "#8a95a5",
        accent: "#7c5cff",
        accent2: "#3ecf8e",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
