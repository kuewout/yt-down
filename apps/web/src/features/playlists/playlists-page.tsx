import { FormEvent, useEffect, useState } from "react";

import { ActivityResponse } from "../../api/client";
import {
  useActivity,
  useCookieBrowsers,
  useCreatePlaylist,
  useDeletePlaylist,
  useDownloadNewVideos,
  usePlaylistVideos,
  usePlaylists,
  useOpenPlaylistFolder,
  useRescanLibrary,
  useSyncPlaylist,
  useUpdatePlaylist,
  useVideos,
} from "./use-playlists";

type FormState = {
  source_url: string;
  title: string;
  folder_name: string;
  folder_path: string;
  cookies_browser: string;
  resolution_limit: string;
};

type DetailTab = "overview" | "videos" | "settings";
type PlaylistFilter = "active" | "inactive";
type ActivityLogEntry = {
  key: string;
  title: string;
  detail: string | null;
  isActive: boolean;
  createdAt: string;
  tone: "live" | "success" | "error" | "info";
  command: string;
};

const initialFormState: FormState = {
  source_url: "",
  title: "",
  folder_name: "",
  folder_path: "",
  cookies_browser: "chrome",
  resolution_limit: "1440",
};

const batchSizeOptions = [1, 5, 10, 25, 50];

const detailTabs: Array<{ key: DetailTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "videos", label: "Videos" },
  { key: "settings", label: "Settings" },
];

function formatRelativeTime(timestamp: string): string {
  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) {
    return "Unknown";
  }

  const diffMs = value - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return formatter.format(diffDays, "day");
  }

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return formatter.format(diffMonths, "month");
  }

  const diffYears = Math.round(diffDays / 365);
  return formatter.format(diffYears, "year");
}

function toPlaylistUrl(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const listId = url.searchParams.get("list");
    if (listId) {
      return `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
    }
  } catch {
    return sourceUrl;
  }

  return sourceUrl;
}

function openExternalUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function formatLogTime(timestamp: string): string {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return "--:--";
  }

  return value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildActivityTitle(activity: ActivityResponse): string {
  const operation = activity.operation?.trim() || "Idle";
  if (activity.playlist_title) {
    return `${operation} ${activity.playlist_title}`;
  }

  return operation;
}

function buildActivityTone(activity: ActivityResponse): ActivityLogEntry["tone"] {
  const detail = `${activity.message ?? ""} ${activity.video_title ?? ""}`.toLowerCase();

  if (detail.includes("failed") || detail.includes("error")) {
    return "error";
  }

  if (
    !activity.is_active &&
    (detail.includes("saved") || detail.includes("finished") || detail.includes("complete") || detail.includes("ready"))
  ) {
    return "success";
  }

  if (activity.is_active) {
    return "live";
  }

  return "info";
}

function buildActivityCommand(activity: ActivityResponse): string {
  const operation = (activity.operation ?? "job").toLowerCase().replace(/\s+/g, "-");

  if (activity.playlist_title) {
    return `${operation} --playlist "${activity.playlist_title}"`;
  }

  return operation;
}

function buildActivityLine(activity: ActivityResponse): string {
  const parts: string[] = [];

  if (activity.message) {
    parts.push(activity.message);
  }

  if (activity.video_title) {
    parts.push(`video="${activity.video_title}"`);
  }

  return parts.join("  ") || "Waiting for updates";
}

export function PlaylistsPage() {
  const { data, isLoading, isError, error } = usePlaylists();
  const cookieBrowsers = useCookieBrowsers();
  const videos = useVideos();
  const activity = useActivity();
  const createPlaylist = useCreatePlaylist();
  const syncPlaylist = useSyncPlaylist();
  const downloadNewVideos = useDownloadNewVideos();
  const openPlaylistFolder = useOpenPlaylistFolder();
  const rescanLibrary = useRescanLibrary();
  const updatePlaylist = useUpdatePlaylist();
  const deletePlaylist = useDeletePlaylist();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [editForm, setEditForm] = useState<FormState>(initialFormState);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [playlistFilter, setPlaylistFilter] = useState<PlaylistFilter>("active");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [downloadBatchSize, setDownloadBatchSize] = useState("5");
  const [downloadBrowser, setDownloadBrowser] = useState("chrome");
  const selectedVideos = usePlaylistVideos(selectedPlaylistId);
  const selectedPlaylist = data?.items.find((playlist) => playlist.id === selectedPlaylistId) ?? null;
  const playlistCount = data?.items.length ?? 0;
  const activePlaylistCount = data?.items.filter((playlist) => playlist.active).length ?? 0;
  const inactivePlaylistCount = playlistCount - activePlaylistCount;
  const downloadedCount = selectedVideos.data?.items.filter((video) => video.downloaded).length ?? 0;
  const failedCount =
    selectedVideos.data?.items.filter((video) => !video.downloaded && Boolean(video.download_error)).length ?? 0;
  const missingCount = (selectedVideos.data?.items.length ?? 0) - downloadedCount;
  const videoStatsByPlaylist = new Map<string, { total: number; downloaded: number; failed: number }>();
  const visiblePlaylists =
    data?.items.filter((playlist) => (playlistFilter === "active" ? playlist.active : !playlist.active)) ?? [];
  const activityData = activity.data;
  const hasActivity = Boolean(activityData && activityData.operation);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [isActivityExpanded, setIsActivityExpanded] = useState(false);
  const browserOptions = cookieBrowsers.data?.options ?? [];
  const supportedBrowserValues = browserOptions.map((option) => option.value);
  const supportedBrowserKey = supportedBrowserValues.join("|");

  videos.data?.items.forEach((video) => {
    const current = videoStatsByPlaylist.get(video.playlist_id) ?? { total: 0, downloaded: 0, failed: 0 };
    current.total += 1;
    if (video.downloaded) {
      current.downloaded += 1;
    }
    if (!video.downloaded && video.download_error) {
      current.failed += 1;
    }
    videoStatsByPlaylist.set(video.playlist_id, current);
  });

  useEffect(() => {
    if (!visiblePlaylists.length) {
      setSelectedPlaylistId(null);
      return;
    }

    if (selectedPlaylistId && visiblePlaylists.some((playlist) => playlist.id === selectedPlaylistId)) {
      return;
    }

    setSelectedPlaylistId(visiblePlaylists[0].id);
  }, [selectedPlaylistId, visiblePlaylists]);

  useEffect(() => {
    if (!selectedPlaylist) {
      setEditForm(initialFormState);
      setDownloadBrowser("chrome");
      return;
    }

    const nextBrowser = selectedPlaylist.cookies_browser ?? "chrome";
    setEditForm({
      source_url: selectedPlaylist.source_url,
      title: selectedPlaylist.title,
      folder_name: selectedPlaylist.folder_name,
      folder_path: selectedPlaylist.folder_path,
      cookies_browser: nextBrowser,
      resolution_limit: selectedPlaylist.resolution_limit?.toString() ?? "",
    });
    setDownloadBrowser(nextBrowser);
  }, [selectedPlaylist]);

  useEffect(() => {
    if (!cookieBrowsers.isSuccess) {
      return;
    }

    const supportedValues = new Set(supportedBrowserValues);
    setForm((current) =>
      supportedValues.has(current.cookies_browser) ? current : { ...current, cookies_browser: "chrome" },
    );
    setEditForm((current) =>
      supportedValues.has(current.cookies_browser) ? current : { ...current, cookies_browser: "chrome" },
    );
    setDownloadBrowser((current) => (supportedValues.has(current) ? current : "chrome"));
  }, [cookieBrowsers.isSuccess, supportedBrowserKey]);

  useEffect(() => {
    if (!activityData || !activityData.operation) {
      return;
    }

    const key = [
      activityData.updated_at ?? activityData.finished_at ?? activityData.started_at ?? "unknown",
      activityData.operation,
      activityData.playlist_id ?? "none",
      activityData.video_id ?? "none",
      activityData.items_completed,
      activityData.message ?? "",
    ].join(":");

    const nextEntry: ActivityLogEntry = {
      key,
      title: buildActivityTitle(activityData),
      detail: buildActivityLine(activityData),
      isActive: activityData.is_active,
      createdAt: activityData.updated_at ?? activityData.finished_at ?? activityData.started_at ?? new Date().toISOString(),
      tone: buildActivityTone(activityData),
      command: buildActivityCommand(activityData),
    };

    setActivityLog((current) => {
      if (current[0]?.key === key || current.some((entry) => entry.key === key)) {
        return current;
      }
      return [nextEntry, ...current].slice(0, 8);
    });

    if (activityData.is_active && activityData.operation.toLowerCase().includes("download")) {
      setIsActivityExpanded(true);
    }
  }, [activityData]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateEditField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const created = await createPlaylist.mutateAsync({
      source_url: form.source_url.trim(),
      title: form.title.trim(),
      folder_name: form.folder_name.trim(),
      folder_path: form.folder_path.trim() || undefined,
      cookies_browser: form.cookies_browser.trim() || "chrome",
      resolution_limit: form.resolution_limit ? Number(form.resolution_limit) : null,
      active: true,
      playlist_id: null,
    });
    setSelectedPlaylistId(created.id);
    setActiveTab("overview");
    await syncPlaylist.mutateAsync(created.id);
    setForm(initialFormState);
    setIsCreateModalOpen(false);
  }

  async function handleUpdateSelectedPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlaylistId) {
      return;
    }

    await updatePlaylist.mutateAsync({
      playlistId: selectedPlaylistId,
      input: {
        title: editForm.title.trim(),
        folder_name: editForm.folder_name.trim(),
        folder_path: editForm.folder_path.trim() || undefined,
        cookies_browser: editForm.cookies_browser.trim() || "chrome",
        resolution_limit: editForm.resolution_limit ? Number(editForm.resolution_limit) : null,
        active: selectedPlaylist?.active ?? true,
      },
    });
  }

  async function handleDeleteSelectedPlaylist() {
    if (!selectedPlaylistId) {
      return;
    }

    await deletePlaylist.mutateAsync(selectedPlaylistId);
    setSelectedPlaylistId(null);
    setActiveTab("overview");
  }

  async function handleToggleSelectedPlaylistActive() {
    if (!selectedPlaylistId || !selectedPlaylist) {
      return;
    }

    await updatePlaylist.mutateAsync({
      playlistId: selectedPlaylistId,
      input: {
        active: !selectedPlaylist.active,
      },
    });
    setPlaylistFilter(selectedPlaylist.active ? "inactive" : "active");
  }

  return (
    <>
      <div className="playlist-page">
        {hasActivity && activityData && (
          <section
            className={`activity-overlay ${activityData.is_active ? "activity-overlay-live" : ""} ${
              isActivityExpanded ? "activity-overlay-expanded" : "activity-overlay-collapsed"
            }`}
          >
            <div className="activity-overlay-header">
              <button
                className="activity-overlay-toggle"
                type="button"
                onClick={() => setIsActivityExpanded((current) => !current)}
                aria-expanded={isActivityExpanded}
                aria-label={isActivityExpanded ? "Collapse activity log" : "Expand activity log"}
              >
                <div className="activity-overlay-heading">
                  <span className="status-label">Latest activity</span>
                  {activityData.is_active && <span className="activity-live-pill">Live</span>}
                </div>
              </button>
            </div>
            {isActivityExpanded ? (
              <div className="activity-console">
                {activityLog.length ? (
                  activityLog.map((entry) => (
                    <article
                      key={entry.key}
                      className={`activity-log-entry activity-log-entry-${entry.tone} ${entry.isActive ? "is-live" : ""}`}
                    >
                      <span className="activity-log-time">{formatLogTime(entry.createdAt)}</span>
                      <span className="activity-log-prompt" aria-hidden="true">
                        {entry.tone === "error" ? "!" : entry.tone === "success" ? "#" : "$"}
                      </span>
                      <div className="activity-log-copy">
                        <strong>{entry.command}</strong>
                        <p className="activity-log-summary">{entry.title}</p>
                        {entry.detail && <p className="activity-log-detail">{entry.detail}</p>}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="hint status-copy">No recent activity yet.</p>
                )}
              </div>
            ) : (
              <div className="activity-collapsed-indicator" aria-hidden="true">
                <span className={`activity-collapsed-dot ${activityData.is_active ? "is-live" : ""}`} />
              </div>
            )}
          </section>
        )}

        <section className="panel panel-spacious playlist-rail">
          <div className="playlist-rail-header">
            <div>
              <div className="eyebrow">Tracked playlists</div>
              <h1>Playlists</h1>
              <p className="lede">
                Sync playlists and pull in new videos when they appear.
              </p>
            </div>
            <div className="playlist-rail-actions">
              <button className="primary-button toolbar-button" type="button" onClick={() => setIsCreateModalOpen(true)}>
                Add playlist
              </button>
              <button
                className="secondary-button toolbar-button"
                type="button"
                disabled={rescanLibrary.isPending}
                onClick={() => rescanLibrary.mutate()}
              >
                {rescanLibrary.isPending ? "Rescanning..." : "Rescan library"}
              </button>
            </div>
          </div>

          <div className="summary-strip summary-strip-wide">
            <article className="summary-card">
              <span className="status-label">Tracked</span>
              <strong>{playlistCount}</strong>
            </article>
            <article className="summary-card">
              <span className="status-label">Active</span>
              <strong>{activePlaylistCount}</strong>
            </article>
            <article className="summary-card">
              <span className="status-label">Inactive</span>
              <strong>{inactivePlaylistCount}</strong>
            </article>
          </div>

          <div className="filter-row" role="tablist" aria-label="Playlist status views">
            <button
              className={`filter-chip ${playlistFilter === "active" ? "active" : ""}`}
              type="button"
              role="tab"
              aria-selected={playlistFilter === "active"}
              onClick={() => setPlaylistFilter("active")}
            >
              Active
            </button>
            <button
              className={`filter-chip ${playlistFilter === "inactive" ? "active" : ""}`}
              type="button"
              role="tab"
              aria-selected={playlistFilter === "inactive"}
              onClick={() => setPlaylistFilter("inactive")}
            >
              Inactive
            </button>
          </div>

          {activity.isError && (
            <p className="error-text">
              Activity unavailable: {activity.error instanceof Error ? activity.error.message : "Unknown error"}
            </p>
          )}
          {cookieBrowsers.isError && (
            <p className="error-text">
              Cookie browser detection failed:{" "}
              {cookieBrowsers.error instanceof Error ? cookieBrowsers.error.message : "Unknown error"}
            </p>
          )}

          {rescanLibrary.data && (
            <section className="status-card status-card-wide">
              <span className="status-label">Latest rescan</span>
              <strong>
                {rescanLibrary.data.files_scanned} files across {rescanLibrary.data.playlists_scanned} playlists
              </strong>
              <p className="hint status-copy">
                Relinked {rescanLibrary.data.relinked_videos}, unchanged {rescanLibrary.data.unchanged_videos},
                missing {rescanLibrary.data.missing_videos}.
              </p>
            </section>
          )}

          {isLoading && <p className="hint">Loading playlists...</p>}
          {isError && (
            <p className="error-text">
              Failed to load playlists: {error instanceof Error ? error.message : "Unknown error"}
            </p>
          )}
          {rescanLibrary.isError && (
            <p className="error-text">
              Rescan failed: {rescanLibrary.error instanceof Error ? rescanLibrary.error.message : "Unknown error"}
            </p>
          )}

          <div className="playlist-list">
            {visiblePlaylists.length ? (
              visiblePlaylists.map((playlist) => {
                const stats = videoStatsByPlaylist.get(playlist.id) ?? { total: 0, downloaded: 0, failed: 0 };
                const downloadPercentage = stats.total > 0 ? Math.round((stats.downloaded / stats.total) * 100) : 0;

                return (
                  <article
                    className={`playlist-card ${selectedPlaylistId === playlist.id ? "selected" : ""} ${
                      playlist.active ? "playlist-card-active" : "playlist-card-inactive"
                    }`}
                    key={playlist.id}
                  >
                  <button
                    className="playlist-card-body"
                    type="button"
                    onClick={() => {
                      setSelectedPlaylistId(playlist.id);
                      setActiveTab("overview");
                    }}
                  >
                    <div className="card-topline">
                      <span className={`status-dot ${playlist.active ? "status-dot-active" : "status-dot-inactive"}`} aria-hidden="true" />
                      <span className="pill">
                        {playlist.resolution_limit ? `${playlist.resolution_limit}p` : "Best"}
                      </span>
                    </div>
                    <h2>{playlist.title}</h2>
                    <div className="playlist-progress">
                      <div className="playlist-progress-copy">
                        <span className="status-label">Downloaded</span>
                        <strong>{downloadPercentage}%</strong>
                      </div>
                      <div className="playlist-progress-bar" aria-hidden="true">
                        <span style={{ width: `${downloadPercentage}%` }} />
                      </div>
                      <p className="card-meta">
                        {stats.downloaded}/{stats.total} videos · Added {formatRelativeTime(playlist.created_at)}
                      </p>
                    </div>
                  </button>
                  <div className="card-actions card-actions-wrap">
                    <button
                      className="primary-button"
                      type="button"
                      disabled={syncPlaylist.isPending}
                      onClick={() => {
                        setSelectedPlaylistId(playlist.id);
                        setActiveTab("overview");
                        syncPlaylist.mutate(playlist.id);
                      }}
                    >
                      {syncPlaylist.isPending && selectedPlaylistId === playlist.id ? "Syncing..." : "Sync"}
                    </button>
                    {playlist.active ? (
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={downloadNewVideos.isPending}
                        onClick={() => {
                          setSelectedPlaylistId(playlist.id);
                          setActiveTab("overview");
                          downloadNewVideos.mutate({
                            playlistId: playlist.id,
                            batchSize: Number(downloadBatchSize),
                            cookiesBrowser:
                              selectedPlaylistId === playlist.id
                                ? downloadBrowser || "chrome"
                                : playlist.cookies_browser || "chrome",
                          });
                        }}
                      >
                        {downloadNewVideos.isPending && selectedPlaylistId === playlist.id
                          ? "Downloading..."
                          : "Download"}
                      </button>
                    ) : (
                      <span className="view-only-note">View only</span>
                    )}
                  </div>
                  </article>
                );
              })
            ) : (
              !isLoading && (
                <p className="hint">
                  {playlistFilter === "active" ? "No active playlists yet." : "No inactive playlists."}
                </p>
              )
            )}
          </div>

          {syncPlaylist.isError && (
            <p className="error-text">
              Sync failed: {syncPlaylist.error instanceof Error ? syncPlaylist.error.message : "Unknown error"}
            </p>
          )}
          {syncPlaylist.data && (
            <p className="hint">
              Synced {syncPlaylist.data.title}: {syncPlaylist.data.new_videos} new / {syncPlaylist.data.total_videos} total
            </p>
          )}
          {downloadNewVideos.isError && (
            <p className="error-text">
              Download failed:{" "}
              {downloadNewVideos.error instanceof Error ? downloadNewVideos.error.message : "Unknown error"}
            </p>
          )}
          {downloadNewVideos.data && (
            <p className="hint">
              Downloaded {downloadNewVideos.data.downloaded_videos}, failed {downloadNewVideos.data.failed_videos}.
            </p>
          )}
        </section>

        <section className="panel panel-spacious detail-panel">
          <div className="eyebrow">Selected playlist</div>
          <h2 className="detail-title">{selectedPlaylist ? selectedPlaylist.title : "Choose a playlist"}</h2>
          {selectedPlaylist ? (
            <>
              <div className="selected-summary detail-summary">
                <article className="selected-summary-row">
                  <div>
                    <span className={`status-chip ${selectedPlaylist.active ? "status-chip-active" : "status-chip-inactive"}`}>
                      {selectedPlaylist.active ? "Active playlist" : "Inactive playlist"}
                    </span>
                  </div>
                </article>
                <article className="selected-summary-row">
                  <div>
                    <span className="status-label">Folder</span>
                    <p className="card-meta">{selectedPlaylist.folder_path}</p>
                  </div>
                  <button
                    className="secondary-button summary-action-button"
                    type="button"
                    disabled={openPlaylistFolder.isPending}
                    onClick={() => openPlaylistFolder.mutate(selectedPlaylist.id)}
                  >
                    {openPlaylistFolder.isPending ? "Opening..." : "Open in Finder"}
                  </button>
                </article>
                <article className="selected-summary-row">
                  <div>
                    <span className="status-label">Source</span>
                    <p className="card-link">{toPlaylistUrl(selectedPlaylist.source_url)}</p>
                  </div>
                  <button
                    className="secondary-button summary-action-button"
                    type="button"
                    onClick={() => openExternalUrl(toPlaylistUrl(selectedPlaylist.source_url))}
                  >
                    Open playlist
                  </button>
                </article>
              </div>

              <div className="detail-actions">
                <button
                  className="primary-button"
                  type="button"
                  disabled={syncPlaylist.isPending}
                  onClick={() => syncPlaylist.mutate(selectedPlaylist.id)}
                >
                  {syncPlaylist.isPending ? "Syncing..." : "Sync"}
                </button>
                {selectedPlaylist.active && (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={downloadNewVideos.isPending}
                    onClick={() =>
                      downloadNewVideos.mutate({
                        playlistId: selectedPlaylist.id,
                        batchSize: Number(downloadBatchSize),
                        cookiesBrowser: downloadBrowser || "chrome",
                      })
                    }
                  >
                    {downloadNewVideos.isPending ? "Downloading..." : "Download"}
                  </button>
                )}
                <button className="secondary-button" type="button" onClick={() => setActiveTab("settings")}>
                  Open settings
                </button>
              </div>

              {selectedPlaylist.active ? (
                <div className="download-batch-row">
                  <label>
                    Batch size
                    <select
                      value={downloadBatchSize}
                      onChange={(event) => setDownloadBatchSize(event.target.value)}
                    >
                      {batchSizeOptions.map((option) => (
                        <option key={option} value={option.toString()}>
                          {option} {option === 1 ? "video" : "videos"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Browser for `yt-dlp`
                    <select value={downloadBrowser} onChange={(event) => setDownloadBrowser(event.target.value)}>
                      {browserOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <p className="hint">Inactive playlists stay view-only. You can still sync them from YouTube.</p>
              )}
              {cookieBrowsers.data?.unsupported_installed.length ? (
                <p className="hint">
                  Installed but not exposed by `yt-dlp`: {cookieBrowsers.data.unsupported_installed.join(", ")}.
                </p>
              ) : null}

              <div className="tab-row" role="tablist" aria-label="Playlist detail sections">
                {detailTabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`tab-button ${activeTab === tab.key ? "active" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === "overview" && (
                <div className="detail-stack">
                  <section className="overview-grid">
                    <article className="summary-card">
                      <span className="status-label">Videos</span>
                      <strong>{selectedVideos.data?.items.length ?? 0}</strong>
                    </article>
                    <article className="summary-card">
                      <span className="status-label">Downloaded</span>
                      <strong>{downloadedCount}</strong>
                    </article>
                    <article className="summary-card">
                      <span className="status-label">Missing</span>
                      <strong>{missingCount}</strong>
                    </article>
                    <article className="summary-card">
                      <span className="status-label">Failed</span>
                      <strong>{failedCount}</strong>
                    </article>
                  </section>
                </div>
              )}

              {activeTab === "videos" && (
                <div className="video-section tab-panel">
                  {selectedVideos.isLoading && <p className="hint">Loading videos...</p>}
                  {selectedVideos.isError && (
                    <p className="error-text">
                      Failed to load videos:{" "}
                      {selectedVideos.error instanceof Error ? selectedVideos.error.message : "Unknown error"}
                    </p>
                  )}
                  <div className="video-list">
                    {selectedVideos.data?.items.length ? (
                      selectedVideos.data.items.map((video) => (
                        <article className="video-row" key={video.id}>
                          <div className="video-row-main">
                            <strong>{video.title}</strong>
                            <p className="card-meta">
                              {video.upload_date ?? "Unknown date"} · {video.video_id}
                            </p>
                            {video.download_error && <p className="error-text compact-error">{video.download_error}</p>}
                          </div>
                          <span
                            className={`pill video-status ${
                              video.downloaded ? "downloaded-pill" : video.download_error ? "failed-pill" : ""
                            }`}
                          >
                            {video.downloaded ? "Downloaded" : video.download_error ? "Failed" : "Missing"}
                          </span>
                        </article>
                      ))
                    ) : (
                      !selectedVideos.isLoading && <p className="hint">No videos synced for this playlist yet.</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "settings" && (
                <form className="playlist-form compact-form tab-panel" onSubmit={handleUpdateSelectedPlaylist}>
                  <div className="status-toggle-row">
                    <div>
                      <span className="status-label">Status</span>
                      <p className="card-meta">
                        {selectedPlaylist.active
                          ? "Active playlists can sync and download."
                          : "Inactive playlists remain visible in the inactive view and can sync only."}
                      </p>
                    </div>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={updatePlaylist.isPending}
                      onClick={handleToggleSelectedPlaylistActive}
                    >
                      {updatePlaylist.isPending
                        ? "Saving..."
                        : selectedPlaylist.active
                          ? "Make inactive"
                          : "Make active"}
                    </button>
                  </div>
                  <div className="field-grid">
                    <label>
                      Title
                      <input
                        disabled={!selectedPlaylist.active}
                        value={editForm.title}
                        onChange={(event) => updateEditField("title", event.target.value)}
                      />
                    </label>
                    <label>
                      Folder name
                      <input
                        disabled={!selectedPlaylist.active}
                        value={editForm.folder_name}
                        onChange={(event) => updateEditField("folder_name", event.target.value)}
                      />
                    </label>
                    <label className="field-span-full">
                      Folder path
                      <input
                        disabled={!selectedPlaylist.active}
                        value={editForm.folder_path}
                        onChange={(event) => updateEditField("folder_path", event.target.value)}
                      />
                    </label>
                    <label>
                      Cookies browser
                      <select
                        disabled={!selectedPlaylist.active}
                        value={editForm.cookies_browser}
                        onChange={(event) => updateEditField("cookies_browser", event.target.value)}
                      >
                        {browserOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Resolution limit
                      <select
                        disabled={!selectedPlaylist.active}
                        value={editForm.resolution_limit}
                        onChange={(event) => updateEditField("resolution_limit", event.target.value)}
                      >
                        <option value="">Best available</option>
                        <option value="1440">1440p</option>
                        <option value="1080">1080p</option>
                        <option value="720">720p</option>
                        <option value="480">480p</option>
                        <option value="360">360p</option>
                      </select>
                    </label>
                  </div>
                  <div className="card-actions card-actions-wrap">
                    {selectedPlaylist.active && (
                      <button className="primary-button" type="submit" disabled={updatePlaylist.isPending}>
                        {updatePlaylist.isPending ? "Saving..." : "Save settings"}
                      </button>
                    )}
                    <button
                      className="danger-button"
                      type="button"
                      disabled={deletePlaylist.isPending}
                      onClick={handleDeleteSelectedPlaylist}
                    >
                      {deletePlaylist.isPending ? "Removing..." : "Remove playlist"}
                    </button>
                  </div>
                  {updatePlaylist.isError && (
                    <p className="error-text">
                      Failed to update playlist:{" "}
                      {updatePlaylist.error instanceof Error ? updatePlaylist.error.message : "Unknown error"}
                    </p>
                  )}
                  {deletePlaylist.isError && (
                    <p className="error-text">
                      Failed to remove playlist:{" "}
                      {deletePlaylist.error instanceof Error ? deletePlaylist.error.message : "Unknown error"}
                    </p>
                  )}
                </form>
              )}
              {openPlaylistFolder.isError && (
                <p className="error-text">
                  Failed to open folder:{" "}
                  {openPlaylistFolder.error instanceof Error ? openPlaylistFolder.error.message : "Unknown error"}
                </p>
              )}
            </>
          ) : (
            <div className="empty-detail-state">No playlist selected.</div>
          )}
        </section>
      </div>

      {isCreateModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsCreateModalOpen(false)}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-playlist-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">New playlist</div>
                <h2 id="add-playlist-title" className="section-title">
                  Add Playlist
                </h2>
              </div>
              <button className="secondary-button modal-close" type="button" onClick={() => setIsCreateModalOpen(false)}>
                Close
              </button>
            </div>

            <form className="playlist-form" onSubmit={handleSubmit}>
              <div className="field-grid">
                <label className="field-span-full">
                  Playlist URL
                  <input
                    required
                    type="url"
                    value={form.source_url}
                    onChange={(event) => updateField("source_url", event.target.value)}
                  />
                </label>
                <label>
                  Display title
                  <input
                    placeholder="Optional before first sync"
                    value={form.title}
                    onChange={(event) => updateField("title", event.target.value)}
                  />
                </label>
                <label>
                  Folder name
                  <input
                    placeholder="Optional, derived from playlist title"
                    value={form.folder_name}
                    onChange={(event) => updateField("folder_name", event.target.value)}
                  />
                </label>
                <label className="field-span-full">
                  Folder path
                  <input
                    placeholder="Optional, defaults to MEDIA_ROOT/folder_name"
                    value={form.folder_path}
                    onChange={(event) => updateField("folder_path", event.target.value)}
                  />
                </label>
                <label>
                  Cookies browser
                  <select
                    value={form.cookies_browser}
                    onChange={(event) => updateField("cookies_browser", event.target.value)}
                  >
                    {browserOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Resolution limit
                  <select
                    value={form.resolution_limit}
                    onChange={(event) => updateField("resolution_limit", event.target.value)}
                  >
                    <option value="">Best available</option>
                    <option value="1440">1440p</option>
                    <option value="1080">1080p</option>
                    <option value="720">720p</option>
                    <option value="480">480p</option>
                    <option value="360">360p</option>
                  </select>
                </label>
              </div>
              <button className="primary-button" type="submit" disabled={createPlaylist.isPending}>
                {createPlaylist.isPending || syncPlaylist.isPending ? "Creating..." : "Create and sync"}
              </button>
              {createPlaylist.isError && (
                <p className="error-text">
                  Failed to save playlist:{" "}
                  {createPlaylist.error instanceof Error ? createPlaylist.error.message : "Unknown error"}
                </p>
              )}
            </form>
          </section>
        </div>
      )}
    </>
  );
}
