import { useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";

import { fetchHealth } from "./api/client";
import { useAppHealth } from "./features/health/use-app-health";
import { PlaylistsPage } from "./features/playlists/playlists-page";

type NavItem = {
  to: string;
  label: string;
  shortLabel: string;
  glyph: string;
};

const navItems: NavItem[] = [
  { to: "/", label: "Overview", shortLabel: "Home", glyph: "01" },
  { to: "/playlists", label: "Playlists", shortLabel: "Lists", glyph: "02" },
  { to: "/settings", label: "Settings", shortLabel: "Setup", glyph: "03" },
];

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

function Navigation({
  collapsed,
  mobile,
  onNavigate,
}: {
  collapsed: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className={`nav ${mobile ? "nav-mobile" : ""}`}>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          onClick={onNavigate}
        >
          <span className="nav-glyph" aria-hidden="true">
            {item.glyph}
          </span>
          <span className="nav-copy">
            <strong>{collapsed && !mobile ? item.shortLabel : item.label}</strong>
            {(!collapsed || mobile) && <small>{item.shortLabel}</small>}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

export function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-lockup">
            <div className="brand-logo" aria-hidden="true">
              YD
            </div>
            {!isSidebarCollapsed && (
              <div className="brand-copy">
                <span className="brand-kicker">yt-down</span>
                <strong>Library Console</strong>
                <p className="hint">Curate, sync, and download without leaving the library view.</p>
              </div>
            )}
          </div>
          <button
            className="secondary-button sidebar-toggle"
            type="button"
            onClick={() => setIsSidebarCollapsed((current) => !current)}
            aria-label={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {isSidebarCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>

        <Navigation collapsed={isSidebarCollapsed} />

        {!isSidebarCollapsed && (
          <div className="sidebar-footer">
            <span className="status-label">Workspace</span>
            <p className="hint">Optimized for wide content rails and fast playlist ops.</p>
          </div>
        )}
      </aside>

      <div className="mobile-topbar">
        <button
          className="secondary-button mobile-menu-button"
          type="button"
          onClick={() => setIsMobileNavOpen(true)}
          aria-label="Open navigation"
        >
          Menu
        </button>
        <div className="mobile-brand">
          <div className="brand-logo" aria-hidden="true">
            YD
          </div>
          <div>
            <span className="brand-kicker">yt-down</span>
            <strong>Library Console</strong>
          </div>
        </div>
      </div>

      {isMobileNavOpen && (
        <div className="mobile-nav-layer" role="presentation" onClick={() => setIsMobileNavOpen(false)}>
          <section
            className="mobile-nav-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-nav-header">
              <div className="mobile-brand">
                <div className="brand-logo" aria-hidden="true">
                  YD
                </div>
                <div>
                  <span className="brand-kicker">yt-down</span>
                  <strong>Navigate</strong>
                </div>
              </div>
              <button
                className="secondary-button mobile-menu-button"
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
              >
                Close
              </button>
            </div>
            <Navigation collapsed={false} mobile onNavigate={() => setIsMobileNavOpen(false)} />
          </section>
        </div>
      )}

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
