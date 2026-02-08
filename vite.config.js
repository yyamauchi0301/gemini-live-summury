import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    define: {
      "import.meta.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY || ""),
    },
  };
});
