import { ReactNode, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";

import { fetchHealth } from "./api/client";
import { useAppHealth } from "./features/health/use-app-health";
import { PlaylistsPage } from "./features/playlists/playlists-page";

type NavItem = {
  to: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: ReactNode;
};

function OverviewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3.5" y="4" width="7" height="7" rx="2" />
      <rect x="13.5" y="4" width="7" height="4.5" rx="2" />
      <rect x="13.5" y="11.5" width="7" height="8.5" rx="2" />
      <rect x="3.5" y="14" width="7" height="6" rx="2" />
    </svg>
  );
}

function PlaylistIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 7.5h12" strokeLinecap="round" />
      <path d="M6 12h8" strokeLinecap="round" />
      <path d="M6 16.5h8" strokeLinecap="round" />
      <path d="M17 10.5v7.25a1.25 1.25 0 0 1-1.85 1.1l-1.3-.72a1.25 1.25 0 0 1-.65-1.1V10.5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7Z" />
      <path
        d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2a1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9a1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1a1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6a1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2a1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9a1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1a1 1 0 0 0 .9.6h.2a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.6Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDoubleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      {collapsed ? (
        <>
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

const navItems: NavItem[] = [
  {
    to: "/",
    label: "Overview",
    shortLabel: "Home",
    description: "Status and system health",
    icon: <OverviewIcon />,
  },
  {
    to: "/playlists",
    label: "Playlists",
    shortLabel: "Lists",
    description: "Track and sync libraries",
    icon: <PlaylistIcon />,
  },
  {
    to: "/settings",
    label: "Settings",
    shortLabel: "Setup",
    description: "Configure local defaults",
    icon: <SettingsIcon />,
  },
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
          title={collapsed && !mobile ? item.label : undefined}
        >
          <span className="nav-glyph" aria-hidden="true">
            {item.icon}
          </span>
          <span className="nav-copy">
            <strong>{collapsed && !mobile ? item.shortLabel : item.label}</strong>
            {(!collapsed || mobile) && <small>{item.description}</small>}
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
              </div>
            )}
          </div>
        </div>

        {!isSidebarCollapsed && <span className="nav-section-label">Workspace</span>}
        <Navigation collapsed={isSidebarCollapsed} />

        {!isSidebarCollapsed && (
          <div className="sidebar-meta">
            <span className="status-label">Library mode</span>
            <strong>Local-first download control</strong>
            <p className="hint">Playlists, sync status, and downloads stay one click away.</p>
          </div>
        )}
      </aside>

      <div className="desktop-rail-toggle-shell">
        <button
          className="sidebar-toggle desktop-rail-toggle"
          type="button"
          onClick={() => setIsSidebarCollapsed((current) => !current)}
          aria-label={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          title={isSidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
        >
          <span className="sidebar-toggle-icon" aria-hidden="true">
            <ChevronDoubleIcon collapsed={isSidebarCollapsed} />
          </span>
        </button>
      </div>

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
            <strong>Library</strong>
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
