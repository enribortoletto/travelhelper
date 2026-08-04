import { Routes, Route, useLocation } from "react-router-dom";
import { MapPinned } from "lucide-react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { TripProvider, useTrip } from "@/lib/trip-context";
import { ToastProvider } from "@/lib/toast-context";
import { ThemeProvider } from "@/lib/theme-context";
import { isSupabaseConfigured } from "@/lib/supabase";
import { env } from "@/lib/env";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import OggiPage from "@/pages/OggiPage";
import ViaggioPage from "@/pages/ViaggioPage";
import DayDetailPage from "@/pages/DayDetailPage";
import CompactPlannerPage from "@/pages/CompactPlannerPage";
import CalendarioPage from "@/pages/CalendarioPage";
import SettingsPage from "@/pages/SettingsPage";
import BottomNav from "@/components/BottomNav";
import InstallPrompt from "@/components/InstallPrompt";

function MissingConfigScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <h1 className="text-lg font-semibold">Configurazione mancante</h1>
      <p className="max-w-sm text-sm text-[var(--text-muted)]">
        Imposta <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> in un
        file <code>.env</code> (vedi <code>.env.example</code>) per collegare l'app al
        progetto Supabase.
      </p>
    </div>
  );
}

// Carica lo script Google Maps una sola volta a livello di app, così è
// sempre disponibile (mappa, Directions, Places) anche nelle pagine senza
// una mappa visibile, come Calendario — da cui si apre comunque il
// dettaglio evento con foto/valutazioni/orari live.
function MapsProvider({ children }: { children: React.ReactNode }) {
  if (!env.googleMapsApiKey) return <>{children}</>;
  return (
    <APIProvider apiKey={env.googleMapsApiKey} libraries={["places", "marker"]}>
      {children}
    </APIProvider>
  );
}

function LoadingScreen() {
  return (
    <div className="flex h-full items-center justify-center">
      <MapPinned size={32} className="animate-skeleton text-[var(--text-muted)]" />
    </div>
  );
}

function TripGate({ children }: { children: React.ReactNode }) {
  const { trip, loading, error } = useTrip();

  if (loading) {
    return <LoadingScreen />;
  }

  if (error || !trip) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <h1 className="text-lg font-semibold">Nessun accesso al viaggio</h1>
        <p className="max-w-sm text-sm text-[var(--text-muted)]">{error}</p>
      </div>
    );
  }

  return <>{children}</>;
}

// La bottom nav non compare nel compact-planner: è una vista di modifica a
// schermo intero (coerente col Figma, che non la mostra in quella schermata).
function AuthedShell() {
  const location = useLocation();
  const hideBottomNav = location.pathname.endsWith("/modifica");

  return (
    <div className="relative flex h-full flex-col overflow-hidden pt-[60px]">
      <main className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<OggiPage />} />
          <Route path="/viaggio" element={<ViaggioPage />} />
          <Route path="/viaggio/:day" element={<DayDetailPage />} />
          <Route path="/viaggio/:day/modifica" element={<CompactPlannerPage />} />
          <Route path="/calendario" element={<CalendarioPage />} />
          <Route path="/impostazioni" element={<SettingsPage />} />
        </Routes>
      </main>
      {!hideBottomNav && (
        <>
          <InstallPrompt />
          <BottomNav />
        </>
      )}
    </div>
  );
}

function AppShell() {
  const { session, loading } = useAuth();

  if (!isSupabaseConfigured) {
    return <MissingConfigScreen />;
  }

  // Il link "recupera password" deve funzionare anche se non c'è ancora un
  // membro del viaggio associato/caricato: niente TripGate qui.
  if (window.location.pathname === "/reset-password") {
    return <ResetPasswordPage />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <MapsProvider>
      <TripProvider>
        <TripGate>
          <AuthedShell />
        </TripGate>
      </TripProvider>
    </MapsProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
