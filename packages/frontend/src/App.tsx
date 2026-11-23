import { Suspense, lazy, ComponentType } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

const RELOAD_KEY = "chunk-reload";

function isChunkLoadError(error: unknown): boolean {
  const message = (error as { message?: string })?.message ?? "";
  const name = (error as { name?: string })?.name ?? "";
  return (
    name === "ChunkLoadError" ||
    message.includes("dynamically imported module") ||
    message.includes("module script failed") ||
    message.includes("Loading chunk") ||
    message.includes("Loading CSS chunk") ||
    message.includes("Unable to preload CSS") ||
    message.includes("is not a valid JavaScript MIME type")
  );
}

function lazyWithReload<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    importFn().catch((error) => {
      if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, "1");
        window.location.reload();
        return new Promise(() => {});
      }

      sessionStorage.removeItem(RELOAD_KEY);
      throw error;
    }),
  );
}

// Eager-load critical routes
import Login from "./pages/Login";
import Preview from "./pages/Preview";

// Lazy-load secondary routes
const ForgotPassword = lazyWithReload(() => import("./pages/ForgotPassword"));
const Live = lazyWithReload(() => import("./pages/Live"));
const Heatmap = lazyWithReload(() => import("./pages/Heatmap"));
const Sales = lazyWithReload(() => import("./pages/Sales"));
const Integrations = lazyWithReload(() => import("./pages/Integrations"));
const Settings = lazyWithReload(() => import("./pages/Settings"));
const Terms = lazyWithReload(() => import("./pages/Terms"));
const Privacy = lazyWithReload(() => import("./pages/Privacy"));
const NotFound = lazyWithReload(() => import("./pages/NotFound"));

// Clear the reload flag on successful app load
sessionStorage.removeItem(RELOAD_KEY);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      storageKey="sentinel-theme"
    >
    <AppErrorBoundary>
      <AuthProvider>
        <WorkspaceProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense
                fallback={
                  <div className="flex min-h-screen items-center justify-center bg-background px-6">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  </div>
                }
              >
                <Routes>
                  <Route path="/" element={<Navigate to="/preview" replace />} />
                  <Route path="/login" element={<Login />} />
                  {/* Nao ha cadastro publico: as contas nascem em Configuracoes > Usuarios. */}
                  <Route path="/register" element={<Navigate to="/login" replace />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  {/* O reset por link de e-mail saiu com o Supabase Auth. */}
                  <Route path="/reset-password" element={<Navigate to="/forgot-password" replace />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />

                  <Route path="/preview" element={<ProtectedRoute><Preview /></ProtectedRoute>} />
                  <Route path="/live" element={<ProtectedRoute><Live /></ProtectedRoute>} />
                  <Route path="/sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
                  <Route path="/heatmap" element={<ProtectedRoute><Heatmap /></ProtectedRoute>} />
                  <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

                  {/* Endereços do painel antigo caem no preview. */}
                  <Route path="/dashboard" element={<Navigate to="/preview" replace />} />
                  <Route path="/tracking" element={<Navigate to="/preview" replace />} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </TooltipProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </AppErrorBoundary>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
