import {
  CSSProperties,
  Dispatch,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import { ActivityResponse } from "../../api/client";
import {
  useActivity,
  useCookieBrowsers,
  useCreatePlaylist,
  useDownloadVideo,
  useDeletePlaylist,
  useDownloadNewVideos,
  usePlaylistVideos,
  usePlaylists,
  usePickPlaylistFolder,
  useOpenPlaylistFolder,
  useRescanLibrary,
  useSyncPlaylist,
  useUpdatePlaylist,
  useVideos,
} from "./use-playlists";

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function RefreshIcon({ isSpinning }: { isSpinning?: boolean }) {
  return (
    <svg 
      className={isSpinning ? "spin" : ""} 
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

type FormState = {
  source_url: string;
  title: string;
  folder_name: string;
  folder_path: string;
  resolution_limit: string;
};

type PlaylistFilter = "active" | "inactive";
type DetailContentTab = "settings" | "videos";
type VideoDownloadFilter = "all" | "downloaded" | "not-downloaded";
type ActivityLogEntry = {
  key: string;
  operation: string;
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
  resolution_limit: "720",
};

const batchSizeOptions = [1, 5, 10, 25, 50];

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

function splitMiddleText(value: string, segmentLength: number): {
  start: string;
  end: string;
  trimmed: boolean;
} {
  if (value.length <= segmentLength * 2 + 3) {
    return {
      start: value,
      end: "",
      trimmed: false,
    };
  }

  return {
    start: `${value.slice(0, segmentLength)}...`,
    end: `...${value.slice(value.length - segmentLength)}`,
    trimmed: true,
  };
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
    hour12: false,
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
  const detail = `${activity.message ?? ""}`.toLowerCase();
  const failedCountMatch = detail.match(/\bfailed\s+(\d+)\b/);
  const hasFailed = detail.includes("failed");
  const hasError = detail.includes("error");
  const hasNonZeroFailed =
    failedCountMatch !== null ? Number.parseInt(failedCountMatch[1] ?? "0", 10) > 0 : hasFailed;

  if (hasError || hasNonZeroFailed) {
    return "error";
  }

  if (detail.includes("success via")) {
    return "success";
  }

  if (
    !activity.is_active &&
    (detail.includes("saved") ||
      detail.includes("finished") ||
      detail.includes("complete") ||
      detail.includes("ready") ||
      detail.includes("synced"))
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

function buildActivityKey(activity: ActivityResponse): string {
  return [
    activity.updated_at ?? activity.finished_at ?? activity.started_at ?? "unknown",
    activity.operation ?? "none",
    activity.playlist_id ?? "none",
    activity.video_id ?? "none",
    activity.items_completed,
    activity.message ?? "",
  ].join(":");
}

function shouldHideActivityEntry(activity: ActivityResponse): boolean {
  const operation = activity.operation?.trim().toLowerCase() ?? "";
  const message = activity.message?.trim().toLowerCase() ?? "";
  return operation === "download" && message.startsWith("preparing ") && message.includes("download(s) with cookies=");
}

function formatActivityMessage(message: string): string {
  const marker = "; failed items:";
  const markerIndex = message.indexOf(marker);
  if (markerIndex === -1) {
    return message;
  }

  const prefix = message.slice(0, markerIndex).trim();
  const failuresRaw = message.slice(markerIndex + marker.length).trim();
  if (!failuresRaw) {
    return message;
  }

  if (failuresRaw.includes("\n")) {
    return `${prefix}; failed items:\n${failuresRaw}`;
  }

  const failureEntries = failuresRaw.split(/,\s+(?=")/).map((entry) => entry.trim()).filter(Boolean);
  if (!failureEntries.length) {
    return message;
  }

  const numberedFailures = failureEntries.map((entry, index) => `${index + 1}. ${entry}`).join("\n");
  return `${prefix}; failed items:\n${numberedFailures}`;
}

function buildActivityLine(activity: ActivityResponse): string {
  const parts: string[] = [];

  if (activity.items_total !== null) {
    parts.push(`${activity.items_completed}/${activity.items_total}`);
  }

  if (activity.message) {
    parts.push(formatActivityMessage(activity.message));
  }

  return parts.join("  ") || "Waiting for updates";
}

function defaultDownloadBrowserValue(options: Array<{ value: string }>): string {
  if (options.some((option) => option.value === "round-robin")) {
    return "round-robin";
  }

  return options[0]?.value ?? "round-robin";
}

function isUndownloadableError(message: string | null): boolean {
  return Boolean(message?.startsWith("UNDOWNLOADABLE: "));
}

function getVideoStatusRank(video: {
  downloaded: boolean;
  download_error: string | null;
}): number {
  if (video.downloaded) {
    return 0;
  }

  if (isUndownloadableError(video.download_error)) {
    return 1;
  }

  return 2;
}

function getVideoStatusLabel(video: {
  downloaded: boolean;
  download_error: string | null;
}): string {
  if (video.downloaded) {
    return "Downloaded";
  }

  if (isUndownloadableError(video.download_error)) {
    return "Undownloadable";
  }

  return "Missing";
}

export function PlaylistsPage() {
  const { data, isLoading, isError, error } = usePlaylists();
  const cookieBrowsers = useCookieBrowsers();
  const videos = useVideos();
  const activity = useActivity();
  const createPlaylist = useCreatePlaylist();
  const syncPlaylist = useSyncPlaylist();
  const downloadNewVideos = useDownloadNewVideos();
  const downloadVideo = useDownloadVideo();
  const openPlaylistFolder = useOpenPlaylistFolder();
  const pickPlaylistFolder = usePickPlaylistFolder();
  const rescanLibrary = useRescanLibrary();
  const updatePlaylist = useUpdatePlaylist();
  const deletePlaylist = useDeletePlaylist();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [editForm, setEditForm] = useState<FormState>(initialFormState);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [playlistFilter, setPlaylistFilter] = useState<PlaylistFilter>("active");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [detailContentTab, setDetailContentTab] = useState<DetailContentTab>("settings");
  const [videoDownloadFilter, setVideoDownloadFilter] = useState<VideoDownloadFilter>("all");
  const [downloadBatchSize, setDownloadBatchSize] = useState("5");
  const [downloadBrowser, setDownloadBrowser] = useState("round-robin");
  const playlistListRef = useRef<HTMLDivElement | null>(null);
  const activityOverlayRef = useRef<HTMLElement | null>(null);
  const resizeSessionRef = useRef<{
    axis: "width" | "height";
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    overlayLeft: number;
    bottomOffset: number;
  } | null>(null);
  const selectedVideos = usePlaylistVideos(selectedPlaylistId);
  const selectedPlaylist = data?.items.find((playlist) => playlist.id === selectedPlaylistId) ?? null;
  const selectedPlaylistSourceUrl = selectedPlaylist ? toPlaylistUrl(selectedPlaylist.source_url) : "";
  const folderPathPreview = splitMiddleText(selectedPlaylist?.folder_path ?? "", 42);
  const sourceUrlPreview = splitMiddleText(selectedPlaylistSourceUrl, 42);
  const playlistCount = data?.items.length ?? 0;
  const activePlaylistCount = data?.items.filter((playlist) => playlist.active).length ?? 0;
  const inactivePlaylistCount = playlistCount - activePlaylistCount;
  const totalVideosCount = selectedVideos.data?.items.length ?? 0;
  const downloadedCount = selectedVideos.data?.items.filter((video) => video.downloaded).length ?? 0;
  const failedCount =
    selectedVideos.data?.items.filter((video) => !video.downloaded && Boolean(video.download_error)).length ?? 0;
  const missingCount = Math.max(0, totalVideosCount - downloadedCount - failedCount);
  const downloadedPercent = totalVideosCount > 0 ? Math.round((downloadedCount / totalVideosCount) * 100) : 0;
  const missingPercent = totalVideosCount > 0 ? Math.round((missingCount / totalVideosCount) * 100) : 0;
  const failedPercent = totalVideosCount > 0 ? Math.round((failedCount / totalVideosCount) * 100) : 0;
  const videoStatsByPlaylist = new Map<string, { total: number; downloaded: number; failed: number }>();
  const visiblePlaylists =
    data?.items.filter((playlist) => (playlistFilter === "active" ? playlist.active : !playlist.active)) ?? [];
  const activityData = activity.data;
  const hasActivity = Boolean(activityData && activityData.operation);
  const activityLog: ActivityLogEntry[] = (activity.events ?? [])
    .filter((entry) => Boolean(entry.operation))
    .filter((entry) => !shouldHideActivityEntry(entry))
    .slice(0, 100)
    .map((entry) => ({
      key: buildActivityKey(entry),
      operation: entry.operation ?? "",
      title: buildActivityTitle(entry),
      detail: buildActivityLine(entry),
      isActive: entry.is_active,
      createdAt: entry.updated_at ?? entry.finished_at ?? entry.started_at ?? new Date().toISOString(),
      tone: buildActivityTone(entry),
      command: buildActivityCommand(entry),
    }));
  const [isActivityExpanded, setIsActivityExpanded] = useState(false);
  const [playlistListWidth, setPlaylistListWidth] = useState<number | null>(null);
  const [isActivityWidthManual, setIsActivityWidthManual] = useState(false);
  const [activityOverlayWidth, setActivityOverlayWidth] = useState<number | null>(null);
  const [activityOverlayHeight, setActivityOverlayHeight] = useState<number | null>(null);
  const [activityResizeAxis, setActivityResizeAxis] = useState<"width" | "height" | null>(null);
  const browserOptions = cookieBrowsers.data?.options ?? [];
  const preferredDownloadBrowser = defaultDownloadBrowserValue(browserOptions);
  const supportedBrowserValues = browserOptions.map((option) => option.value);
  const supportedBrowserKey = supportedBrowserValues.join("|");
  const sortedSelectedVideos =
    selectedVideos.data?.items
      .slice()
      .sort((left, right) => {
        const statusDifference = getVideoStatusRank(left) - getVideoStatusRank(right);
        if (statusDifference !== 0) {
          return statusDifference;
        }

        return 0;
      }) ?? [];
  const downloadableVideos = sortedSelectedVideos.filter(
    (video) => !video.downloaded && !isUndownloadableError(video.download_error),
  );
  const filteredSelectedVideos = sortedSelectedVideos.filter((video) => {
    if (videoDownloadFilter === "downloaded") {
      return video.downloaded;
    }

    if (videoDownloadFilter === "not-downloaded") {
      return !video.downloaded;
    }

    return true;
  });
  const nextBatchVideos = downloadableVideos.slice(0, Number(downloadBatchSize));

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
      return;
    }

    setEditForm({
      source_url: selectedPlaylist.source_url,
      title: selectedPlaylist.title,
      folder_name: selectedPlaylist.folder_name,
      folder_path: selectedPlaylist.folder_path,
      resolution_limit: selectedPlaylist.resolution_limit?.toString() ?? "",
    });
  }, [selectedPlaylist]);

  useEffect(() => {
    if (selectedPlaylistId) {
      setDetailContentTab("settings");
    }
  }, [selectedPlaylistId]);

  useEffect(() => {
    setVideoDownloadFilter("all");
  }, [selectedPlaylistId]);

  useEffect(() => {
    if (!cookieBrowsers.isSuccess) {
      return;
    }

    const supportedValues = new Set(supportedBrowserValues);
    setDownloadBrowser((current) => (supportedValues.has(current) ? current : preferredDownloadBrowser));
  }, [cookieBrowsers.isSuccess, preferredDownloadBrowser, supportedBrowserKey]);

  useEffect(() => {
    if (activityData?.is_active && activityData.operation?.toLowerCase().includes("download")) {
      setIsActivityExpanded(true);
    }
  }, [activityData]);

  useEffect(() => {
    const element = playlistListRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      const measured = element.getBoundingClientRect().width;
      if (measured > 0) {
        setPlaylistListWidth(Math.round(measured));
      }
    };
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playlistListWidth || isActivityWidthManual) {
      return;
    }
    setActivityOverlayWidth(playlistListWidth);
  }, [playlistListWidth, isActivityWidthManual]);

  useEffect(() => {
    if (!activityResizeAxis) {
      return;
    }

    function onPointerMove(event: PointerEvent) {
      const session = resizeSessionRef.current;
      if (!session) {
        return;
      }

      event.preventDefault();
      if (session.axis === "width") {
        const minWidth = 280;
        const maxWidth = Math.max(minWidth, Math.floor(window.innerWidth - session.overlayLeft - 14));
        const nextWidth = session.startWidth + (event.clientX - session.startX);
        const clampedWidth = Math.min(maxWidth, Math.max(minWidth, nextWidth));
        setActivityOverlayWidth(clampedWidth);
        setIsActivityWidthManual(true);
        return;
      }

      const minHeight = 160;
      const maxHeight = Math.max(minHeight, Math.floor(window.innerHeight - session.bottomOffset - 72));
      const nextHeight = session.startHeight - (event.clientY - session.startY);
      const clampedHeight = Math.min(maxHeight, Math.max(minHeight, nextHeight));
      setActivityOverlayHeight(clampedHeight);
    }

    function onPointerEnd() {
      resizeSessionRef.current = null;
      setActivityResizeAxis(null);
    }

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
    };
  }, [activityResizeAxis]);

  function getOverlayBottomOffsetPx() {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--overlay-bottom-offset").trim();
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 34;
  }

  function handleResizeStart(axis: "width" | "height") {
    return (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isActivityExpanded || !activityOverlayRef.current) {
        return;
      }

      const rect = activityOverlayRef.current.getBoundingClientRect();
      resizeSessionRef.current = {
        axis,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
        overlayLeft: rect.left,
        bottomOffset: getOverlayBottomOffsetPx(),
      };
      setActivityResizeAxis(axis);
    };
  }

  const activityOverlayStyle: CSSProperties = {};
  if (isActivityExpanded && activityOverlayWidth) {
    activityOverlayStyle.width = `${Math.round(activityOverlayWidth)}px`;
  }
  if (isActivityExpanded && activityOverlayHeight) {
    activityOverlayStyle.height = `${Math.round(activityOverlayHeight)}px`;
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateEditField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  function updateTitleAndFolder(
    updater: Dispatch<SetStateAction<FormState>>,
    title: string,
  ) {
    updater((current) => ({ ...current, title, folder_name: title }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const created = await createPlaylist.mutateAsync({
      source_url: form.source_url.trim(),
      title: form.title.trim(),
      folder_name: form.title.trim(),
      folder_path: form.folder_path.trim() || undefined,
      resolution_limit: form.resolution_limit ? Number(form.resolution_limit) : null,
      active: true,
      playlist_id: null,
    });
    setSelectedPlaylistId(created.id);
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
        folder_name: editForm.title.trim(),
        folder_path: editForm.folder_path.trim() || undefined,
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

  async function handlePickFolderPath() {
    if (!selectedPlaylistId) {
      return;
    }

    const result = await pickPlaylistFolder.mutateAsync(selectedPlaylistId);
    if (result.selected_path) {
      updateEditField("folder_path", result.selected_path);
    }
  }

  function handleOpenDownloadModal() {
    setDownloadBatchSize("5");
    setDownloadBrowser(preferredDownloadBrowser);
    setIsActivityExpanded(false);
    setIsDownloadModalOpen(true);
  }

  async function handleConfirmDownload() {
    if (!selectedPlaylist) {
      return;
    }

    await downloadNewVideos.mutateAsync({
      playlistId: selectedPlaylist.id,
      batchSize: Number(downloadBatchSize),
      cookiesBrowser: downloadBrowser,
    });
    setIsDownloadModalOpen(false);
  }

  async function handleAdHocDownload(videoId: string) {
    if (!selectedPlaylist) {
      return;
    }

    await downloadVideo.mutateAsync({
      playlistId: selectedPlaylist.id,
      videoId,
      cookiesBrowser: preferredDownloadBrowser,
    });
  }

  return (
    <>
      <div className="playlist-page">
        {hasActivity && activityData && (
          <section
            ref={activityOverlayRef}
            className={`activity-overlay ${activityData.is_active ? "activity-overlay-live" : ""} ${
              isActivityExpanded ? "activity-overlay-expanded" : "activity-overlay-collapsed"
            } ${activityResizeAxis ? `activity-overlay-resizing-${activityResizeAxis}` : ""}`}
            style={activityOverlayStyle}
          >
            {isActivityExpanded && (
              <>
                <div
                  className="activity-resize-handle activity-resize-handle-top"
                  onPointerDown={handleResizeStart("height")}
                  aria-hidden="true"
                />
                <div
                  className="activity-resize-handle activity-resize-handle-right"
                  onPointerDown={handleResizeStart("width")}
                  aria-hidden="true"
                />
              </>
            )}
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
                        {entry.operation !== "download" && (
                          <>
                            <strong>{entry.command}</strong>
                            <p className="activity-log-summary">{entry.title}</p>
                          </>
                        )}
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
                `Sync`会读取本地文件夹及线上列表，并自动发现新视频。
              </p>
            </div>
            <div className="playlist-rail-actions">
              <button 
                className="primary-button icon-toolbar-button" 
                type="button" 
                onClick={() => setIsCreateModalOpen(true)}
                aria-label="Add playlist"
                title="Add playlist"
              >
                <PlusIcon />
              </button>
              <button
                className="secondary-button icon-toolbar-button"
                type="button"
                disabled={rescanLibrary.isPending}
                onClick={() => rescanLibrary.mutate()}
                aria-label="Rescan library"
                title="Rescan library"
              >
                <RefreshIcon isSpinning={rescanLibrary.isPending} />
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

          <div className="filter-row">
            <button
              className="filter-chip active"
              type="button"
              onClick={() =>
                setPlaylistFilter((current) => (current === "active" ? "inactive" : "active"))
              }
            >
              {playlistFilter === "active" ? "Showing Active" : "Showing Inactive"}
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

          <div className="playlist-list" ref={playlistListRef}>
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
                    <div className="playlist-card-shell">
                      <button
                        className="playlist-card-body"
                        type="button"
                        onClick={() => {
                          setSelectedPlaylistId(playlist.id);
                          setDetailContentTab("settings");
                        }}
                      >
                        <div className="card-topline">
                          <span
                            className={`status-dot ${playlist.active ? "status-dot-active" : "status-dot-inactive"}`}
                            aria-hidden="true"
                          />
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
            <div className="hint">
              <p>
                Synced {syncPlaylist.data.title}: {syncPlaylist.data.new_videos} new / {syncPlaylist.data.total_videos} total,
                local matched {syncPlaylist.data.matched_local_videos}.
              </p>
              {syncPlaylist.data.unmatched_local_files.length > 0 && (
                <>
                  <p>Unmatched local files:</p>
                <pre className="hint">{syncPlaylist.data.unmatched_local_files.join("\n")}</pre>
                </>
              )}
            </div>
          )}
          {downloadNewVideos.isError && (
            <p className="error-text">
              Download failed:{" "}
              {downloadNewVideos.error instanceof Error ? downloadNewVideos.error.message : "Unknown error"}
            </p>
          )}
          {downloadVideo.isError && (
            <p className="error-text">
              Ad-hoc download failed:{" "}
              {downloadVideo.error instanceof Error ? downloadVideo.error.message : "Unknown error"}
            </p>
          )}
          {downloadNewVideos.data && (
            <p className="hint">
              Downloaded {downloadNewVideos.data.downloaded_videos}, failed {downloadNewVideos.data.failed_videos}.
            </p>
          )}
        </section>

        <section className="panel panel-spacious detail-panel">
          {selectedPlaylist ? (
            <>
              <div className="selected-playlist-shell">
                <div className="detail-hero detail-hero-card">
                  <div className="detail-hero-copy">
                    <div className="eyebrow">Selected</div>
                    <div className="detail-heading-row">
                      <h2 className="detail-title">{selectedPlaylist.title}</h2>
                      <span className={`status-chip ${selectedPlaylist.active ? "status-chip-active" : "status-chip-inactive"}`}>
                        {selectedPlaylist.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="detail-tag-row">
                      <span className="pill">{selectedPlaylist.resolution_limit ? `${selectedPlaylist.resolution_limit}p` : "Best"}</span>
                      <span className="pill detail-pill-muted">{downloadedCount}/{selectedVideos.data?.items.length ?? 0}</span>
                    </div>
                  </div>

                  <div className="detail-header-controls">
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
                          onClick={handleOpenDownloadModal}
                        >
                          {downloadNewVideos.isPending ? "Downloading..." : "Download"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="detail-side-stack">
                  <div className="selected-summary detail-summary">
                    <article className="selected-summary-card">
                      <div className="summary-stack">
                        <span className="status-label">Folder</span>
                        <p className="card-meta summary-inline-value summary-inline-value-2line" title={selectedPlaylist.folder_path}>
                          {folderPathPreview.trimmed ? (
                            <>
                              <span className="summary-inline-start">{folderPathPreview.start}</span>
                              <span className="summary-inline-end">{folderPathPreview.end}</span>
                            </>
                          ) : (
                            <span className="summary-inline-start">{folderPathPreview.start}</span>
                          )}
                        </p>
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
                    <article className="selected-summary-card">
                      <div className="summary-stack">
                        <span className="status-label">Source</span>
                        <p className="card-link summary-inline-value summary-inline-value-2line" title={selectedPlaylistSourceUrl}>
                          {sourceUrlPreview.trimmed ? (
                            <>
                              <span className="summary-inline-start">{sourceUrlPreview.start}</span>
                              <span className="summary-inline-end">{sourceUrlPreview.end}</span>
                            </>
                          ) : (
                            <span className="summary-inline-start">{sourceUrlPreview.start}</span>
                          )}
                        </p>
                      </div>
                      <button
                        className="secondary-button summary-action-button"
                        type="button"
                        onClick={() => openExternalUrl(selectedPlaylistSourceUrl)}
                      >
                        Open on Youtube
                      </button>
                    </article>
                  </div>

                  {selectedPlaylist.active ? null : (
                    <p className="hint detail-inline-hint">Inactive playlists stay visible and can still sync.</p>
                  )}
                </div>
              </div>
              <section className="overview-grid">
                <article className="summary-card detail-stat-card detail-stat-downloaded">
                  <span className="status-label">Downloaded</span>
                  <strong>{downloadedPercent}%</strong>
                  <p className="card-meta">
                    {downloadedCount}/{totalVideosCount} videos
                  </p>
                </article>
                <article className="summary-card detail-stat-card detail-stat-missing">
                  <span className="status-label">Missing</span>
                  <strong>{missingPercent}%</strong>
                  <p className="card-meta">
                    {missingCount}/{totalVideosCount} videos
                  </p>
                </article>
                <article className="summary-card detail-stat-card detail-stat-failed">
                  <span className="status-label">Failed</span>
                  <strong>{failedPercent}%</strong>
                  <p className="card-meta">
                    {failedCount}/{totalVideosCount} videos
                  </p>
                </article>
              </section>

              <div className="tab-row detail-content-tab-row" role="tablist" aria-label="Selected playlist details">
                <button
                  className={`tab-button ${detailContentTab === "settings" ? "active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={detailContentTab === "settings"}
                  onClick={() => setDetailContentTab("settings")}
                >
                  Settings
                </button>
                <button
                  className={`tab-button ${detailContentTab === "videos" ? "active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={detailContentTab === "videos"}
                  onClick={() => setDetailContentTab("videos")}
                >
                  Videos
                </button>
              </div>

              {detailContentTab === "settings" && (
                <section className="detail-content-single">
                <div className="selected-summary-card detail-settings-card">
                  <div className="summary-inline-row">
                    <span className="status-label">Playlist settings</span>
                  </div>
                  <form className="playlist-form compact-form" onSubmit={handleUpdateSelectedPlaylist}>
                    <div className="status-toggle-row status-toggle-simple">
                      <span className={`status-chip ${selectedPlaylist.active ? "status-chip-active" : "status-chip-inactive"}`}>
                        {selectedPlaylist.active ? "Active" : "Inactive"}
                      </span>
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
                          onChange={(event) => updateTitleAndFolder(setEditForm, event.target.value)}
                        />
                      </label>
                      <label className="field-span-full">
                        Folder path
                        <div className="folder-path-row">
                          <input
                            disabled={!selectedPlaylist.active}
                            value={editForm.folder_path}
                            onChange={(event) => updateEditField("folder_path", event.target.value)}
                          />
                          <button
                            className="icon-action-button"
                            type="button"
                            aria-label="Choose folder"
                            title="Choose folder"
                            disabled={!selectedPlaylist.active || pickPlaylistFolder.isPending}
                            onClick={handlePickFolderPath}
                          >
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path
                                d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4.3l1.6 1.7h7.1A2.5 2.5 0 0 1 21 9.2v8.3a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </div>
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
                    {pickPlaylistFolder.isError && (
                      <p className="error-text">
                        Failed to open folder picker:{" "}
                        {pickPlaylistFolder.error instanceof Error ? pickPlaylistFolder.error.message : "Unknown error"}
                      </p>
                    )}
                    {deletePlaylist.isError && (
                      <p className="error-text">
                        Failed to remove playlist:{" "}
                        {deletePlaylist.error instanceof Error ? deletePlaylist.error.message : "Unknown error"}
                      </p>
                    )}
                  </form>
                </div>
                </section>
              )}

              {detailContentTab === "videos" && (
                <section className="detail-content-single">
                <div className="selected-summary-card detail-videos-card">
                  <div className="summary-inline-row">
                    <span className="status-label">Video list</span>
                  </div>
                  <div className="filter-row detail-video-filter-row" role="tablist" aria-label="Video download filter">
                    <button
                      className={`filter-chip ${videoDownloadFilter === "all" ? "active" : ""}`}
                      type="button"
                      role="tab"
                      aria-selected={videoDownloadFilter === "all"}
                      onClick={() => setVideoDownloadFilter("all")}
                    >
                      All ({sortedSelectedVideos.length})
                    </button>
                    <button
                      className={`filter-chip ${videoDownloadFilter === "downloaded" ? "active" : ""}`}
                      type="button"
                      role="tab"
                      aria-selected={videoDownloadFilter === "downloaded"}
                      onClick={() => setVideoDownloadFilter("downloaded")}
                    >
                      Downloaded ({downloadedCount})
                    </button>
                    <button
                      className={`filter-chip ${videoDownloadFilter === "not-downloaded" ? "active" : ""}`}
                      type="button"
                      role="tab"
                      aria-selected={videoDownloadFilter === "not-downloaded"}
                      onClick={() => setVideoDownloadFilter("not-downloaded")}
                    >
                      Not downloaded ({Math.max(0, totalVideosCount - downloadedCount)})
                    </button>
                  </div>
                  {selectedVideos.isLoading && <p className="hint">Loading videos...</p>}
                  {selectedVideos.isError && (
                    <p className="error-text">
                      Failed to load videos:{" "}
                      {selectedVideos.error instanceof Error ? selectedVideos.error.message : "Unknown error"}
                    </p>
                  )}
                  <div className="video-list detail-video-list">
                    {filteredSelectedVideos.length ? (
                      filteredSelectedVideos.map((video) => (
                        <article className="video-row" key={video.id}>
                          <div className="video-row-main">
                            <strong>{video.title}</strong>
                            <p className="card-meta">{video.upload_date ? `${video.upload_date} · ${video.video_id}` : video.video_id}</p>
                            {video.download_error && <p className="error-text compact-error">{video.download_error}</p>}
                          </div>
                          <div className="video-row-actions">
                            <span
                              className={`pill video-status ${
                                video.downloaded
                                  ? "downloaded-pill"
                                  : isUndownloadableError(video.download_error)
                                    ? "failed-pill"
                                    : ""
                              }`}
                            >
                              {getVideoStatusLabel(video)}
                            </span>
                            {!video.downloaded && (
                              <button
                                className="secondary-button ad-hoc-download-button"
                                type="button"
                                disabled={downloadVideo.isPending}
                                onClick={() => handleAdHocDownload(video.id)}
                              >
                                {downloadVideo.isPending ? "Downloading..." : "Ad-hoc download"}
                              </button>
                            )}
                          </div>
                        </article>
                      ))
                    ) : (
                      !selectedVideos.isLoading && (
                        <p className="hint">
                          {sortedSelectedVideos.length
                            ? "No videos match the selected filter."
                            : "No videos synced for this playlist yet."}
                        </p>
                      )
                    )}
                  </div>
                </div>
                </section>
              )}
              {openPlaylistFolder.isError && (
                <p className="error-text">
                  Failed to open folder:{" "}
                  {openPlaylistFolder.error instanceof Error ? openPlaylistFolder.error.message : "Unknown error"}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="eyebrow">Selected</div>
              <h2 className="detail-title">Choose a playlist</h2>
              <p className="hint">Select one from the left to inspect videos, downloads, and settings.</p>
            </>
          )}
        </section>
      </div>

      {isDownloadModalOpen && selectedPlaylist && (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsDownloadModalOpen(false)}>
          <section
            className="modal-panel download-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-batch-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">Download batch</div>
                <h2 id="download-batch-title" className="section-title">
                  Confirm Next Download
                </h2>
                <p className="hint">Previewing next {nextBatchVideos.length} videos from "{selectedPlaylist.title}".</p>
              </div>
              <button className="secondary-button modal-close" type="button" onClick={() => setIsDownloadModalOpen(false)}>
                Close
              </button>
            </div>

            <div className="field-grid">
              <label>
                Batch size
                <select value={downloadBatchSize} onChange={(event) => setDownloadBatchSize(event.target.value)}>
                  {batchSizeOptions.map((option) => (
                    <option key={option} value={option.toString()}>
                      {option} {option === 1 ? "video" : "videos"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cookies browser
                <select value={downloadBrowser} onChange={(event) => setDownloadBrowser(event.target.value)}>
                  {browserOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="video-list download-preview-list">
              {nextBatchVideos.length ? (
                nextBatchVideos.map((video) => (
                  <article className="video-row" key={video.id}>
                    <div className="video-row-main">
                      <strong>{video.title}</strong>
                      <p className="card-meta">{video.upload_date ? `${video.upload_date} · ${video.video_id}` : video.video_id}</p>
                    </div>
                    <span className="pill video-status">Queued</span>
                  </article>
                ))
              ) : (
                <p className="hint">No downloadable videos found in the next batch.</p>
              )}
            </div>

            <div className="card-actions">
              <button
                className="primary-button"
                type="button"
                disabled={downloadNewVideos.isPending || nextBatchVideos.length === 0}
                onClick={handleConfirmDownload}
              >
                {downloadNewVideos.isPending ? "Downloading..." : `Download ${nextBatchVideos.length}`}
              </button>
            </div>
          </section>
        </div>
      )}

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
                  Title
                  <input
                    placeholder="Optional before first sync"
                    value={form.title}
                    onChange={(event) => updateTitleAndFolder(setForm, event.target.value)}
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
