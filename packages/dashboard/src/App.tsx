import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./lib/api";
import { ThemeProvider } from "./lib/theme";
import { ToastProvider } from "./lib/toast";
import { Sidebar } from "./components/Sidebar";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Queries } from "./pages/Queries";
import { QueryDetail } from "./pages/QueryDetail";
import { Suggestions } from "./pages/Suggestions";
import { NPlusOne } from "./pages/NPlusOne";
import { ConnectDatabase } from "./pages/ConnectDatabase";

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    apiFetch("/auth/session").then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);

  const handleLogout = async () => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    queryClient.clear();
    setAuthed(false);
  };

  if (authed === null) return <div className="min-h-screen bg-app" />;

  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="min-h-screen bg-app font-sans text-sm text-ink">
          {!authed ? (
            <Login onSuccess={() => setAuthed(true)} />
          ) : (
            <BrowserRouter>
              <div className="flex min-h-screen">
                <Sidebar onLogout={handleLogout} />
                <main className="h-screen min-w-0 flex-1 overflow-y-auto">
                  <Routes>
                    <Route path="/" element={<Overview />} />
                    <Route path="/queries" element={<Queries />} />
                    <Route path="/queries/:id" element={<QueryDetail />} />
                    <Route path="/suggestions" element={<Suggestions />} />
                    <Route path="/n-plus-one" element={<NPlusOne />} />
                    <Route path="/connect" element={<ConnectDatabase />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </div>
            </BrowserRouter>
          )}
        </div>
      </ToastProvider>
    </ThemeProvider>
  );
}
