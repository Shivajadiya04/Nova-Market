import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In development (and `vite preview`) every /api request, including the AI Buddy websocket,
// goes to the gateway, exactly as in production where the gateway also serves the built app.
// The browser only talks to one origin, so the httpOnly auth cookie works without CORS.
// GATEWAY_URL is read here only; it is not exposed to the browser bundle.
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const proxy = {
        '/api': { target: env.GATEWAY_URL || 'http://localhost:8080', ws: true, changeOrigin: false },
    };

    return {
        plugins: [ react() ],
        // Pre-bundle up front so the first page load is not interrupted by a dependency re-optimisation
        optimizeDeps: { include: [ 'react', 'react-dom/client', 'react-router-dom', 'socket.io-client' ] },
        server: { port: 5173, strictPort: true, proxy },
        preview: { port: 4173, strictPort: true, proxy },
        build: { sourcemap: false },
    };
});
