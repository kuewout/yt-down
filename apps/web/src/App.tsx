import { Link, Route, Routes } from "react-router-dom";

import { fetchHealth } from "./api/client";
import { useAppHealth } from "./features/health/use-app-health";

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
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-kicker">yt-down</span>
          <strong>Library Console</strong>
        </div>
        <nav className="nav">
          <Link to="/">Overview</Link>
          <Link to="/playlists">Playlists</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/playlists"
            element={
              <PlaceholderPage
                title="Playlists"
                description="This is where playlist CRUD, sync, and download controls will land."
              />
            }
          />
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
