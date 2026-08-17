import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        veriverse: {
          blue: "#0A2540",
          purple: "#6C63FF",
          dark: "#1F2937",
          light: "#FFFFFF",
          slate: "#F8FAFC",
          border: "#E2E8F0",
        },
      },
      boxShadow: {
        vv: "0 6px 20px rgba(10, 37, 64, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
