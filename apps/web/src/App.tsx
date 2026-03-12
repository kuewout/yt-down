import { useState } from "react";
import { Link, Route, Routes } from "react-router-dom";

import { fetchHealth } from "./api/client";
import { useAppHealth } from "./features/health/use-app-health";
import { PlaylistsPage } from "./features/playlists/playlists-page";

function HomePage() {
  const { data, isLoading, isError } = useAppHealth();

  return (
    <section className="panel">
      <div className="eyebrow">Local media manager</div>
      <h1>yt-down</h1>
      <p className="lede">
        Track playlists, detect new uploads, and manage local downloads from one UI.
      </p>
      <div className="status-card">
        <span className="status-label">API status</span>
        {isLoading && <strong>Checking...</strong>}
        {isError && <strong>Unavailable</strong>}
        {data && (
          <strong>
            {data.status} / {data.environment}
          </strong>
        )}
      </div>
      <p className="hint">Expected API base URL: {fetchHealth.endpoint}</p>
    </section>
  );
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="panel">
      <div className="eyebrow">Planned screen</div>
      <h1>{title}</h1>
      <p className="lede">{description}</p>
    </section>
  );
}

export function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-lockup">
            <div className="brand-logo" aria-hidden="true">
              YD
            </div>
            {!isSidebarCollapsed && (
              <div>
                <span className="brand-kicker">yt-down</span>
                <strong>Library Console</strong>
              </div>
            )}
          </div>
          <button
            className="secondary-button sidebar-toggle"
            type="button"
            onClick={() => setIsSidebarCollapsed((current) => !current)}
            aria-label={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {isSidebarCollapsed ? ">" : "<"}
          </button>
        </div>
        <nav className="nav">
          <Link to="/" aria-label="Overview">
            <span className="nav-icon">OV</span>
            {!isSidebarCollapsed && <span>Overview</span>}
          </Link>
          <Link to="/playlists" aria-label="Playlists">
            <span className="nav-icon">PL</span>
            {!isSidebarCollapsed && <span>Playlists</span>}
          </Link>
          <Link to="/settings" aria-label="Settings">
            <span className="nav-icon">ST</span>
            {!isSidebarCollapsed && <span>Settings</span>}
          </Link>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/playlists" element={<PlaylistsPage />} />
          <Route
            path="/settings"
            element={
              <PlaceholderPage
                title="Settings"
                description="This is where MEDIA_ROOT and operational defaults will be configured."
              />
            }
          />
        </Routes>
      </main>
    </div>
  );
}
