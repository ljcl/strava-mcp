import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export function mcpAppConfig(_name: string) {
  const INPUT = process.env.INPUT;
  return defineConfig({
    plugins: [react(), ...(INPUT ? [viteSingleFile()] : [])],
    build: INPUT
      ? {
          rollupOptions: { input: INPUT },
          outDir: "dist",
          emptyOutDir: false,
        }
      : {},
  });
}
