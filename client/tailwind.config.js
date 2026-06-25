/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        prakash: {
          red: "#C8102E",
          dark: "#9A0C23",
          ink: "#1a1a1a",
        },
      },
    },
  },
  plugins: [],
};
