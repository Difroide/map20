import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * O navegador não precisa de nenhuma variável de ambiente: a autenticação é
 * contra a própria API (/api/auth), na mesma origem. VITE_API_URL continua
 * valendo (lib/apiUrl.ts) para o caso do backend morar em outro domínio.
 */
export default defineConfig(() => {
  return {
    server: {
      host: "::",
      port: 5173,
      hmr: {
        overlay: false,
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
      include: ["@tanstack/react-query"],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui':     ['lucide-react'],
            'vendor-query':  ['@tanstack/react-query'],
          },
        },
      },
    },
  };
});
