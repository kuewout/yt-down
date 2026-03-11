import { FormEvent, useEffect, useState } from "react";

import {
  useCreatePlaylist,
  useDeletePlaylist,
  useDownloadNewVideos,
  usePlaylistVideos,
  usePlaylists,
  useSyncPlaylist,
  useUpdatePlaylist,
} from "./use-playlists";

type FormState = {
  source_url: string;
  title: string;
  folder_name: string;
  folder_path: string;
  cookies_browser: string;
  resolution_limit: string;
};

const initialFormState: FormState = {
  source_url: "",
  title: "",
  folder_name: "",
  folder_path: "",
  cookies_browser: "chrome",
  resolution_limit: "1440",
};

export function PlaylistsPage() {
  const { data, isLoading, isError, error } = usePlaylists();
  const createPlaylist = useCreatePlaylist();
  const syncPlaylist = useSyncPlaylist();
  const downloadNewVideos = useDownloadNewVideos();
  const updatePlaylist = useUpdatePlaylist();
  const deletePlaylist = useDeletePlaylist();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const selectedVideos = usePlaylistVideos(selectedPlaylistId);
  const selectedPlaylist = data?.items.find((playlist) => playlist.id === selectedPlaylistId) ?? null;
  const [editForm, setEditForm] = useState<FormState>(initialFormState);
  const playlistCount = data?.items.length ?? 0;

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
      cookies_browser: selectedPlaylist.cookies_browser ?? "",
      resolution_limit: selectedPlaylist.resolution_limit?.toString() ?? "",
    });
  }, [selectedPlaylist]);

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
      cookies_browser: form.cookies_browser.trim() || null,
      resolution_limit: form.resolution_limit ? Number(form.resolution_limit) : null,
      active: true,
      playlist_id: null,
    });
    setSelectedPlaylistId(created.id);
    await syncPlaylist.mutateAsync(created.id);
    setForm(initialFormState);
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
        cookies_browser: editForm.cookies_browser.trim() || null,
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

  return (
    <div className="split-layout">
      <section className="panel panel-spacious">
        <div className="eyebrow">Tracked playlists</div>
        <h1>Playlists</h1>
        <p className="lede">
          Track subscribed channels, sync for new uploads, and pull missing videos into your local
          library.
        </p>
        <div className="summary-strip">
          <article className="summary-card">
            <span className="status-label">Tracked</span>
            <strong>{playlistCount}</strong>
          </article>
          <article className="summary-card">
            <span className="status-label">Selected</span>
            <strong>{selectedPlaylist ? selectedPlaylist.title : "None"}</strong>
          </article>
        </div>
        {isLoading && <p className="hint">Loading playlists...</p>}
        {isError && (
          <p className="error-text">
            Failed to load playlists: {error instanceof Error ? error.message : "Unknown error"}
          </p>
        )}
        <div className="playlist-list">
          {data?.items.length ? (
            data.items.map((playlist) => (
              <article
                className={`playlist-card ${selectedPlaylistId === playlist.id ? "selected" : ""}`}
                key={playlist.id}
              >
                <div className="card-topline">
                  <span className="eyebrow">{playlist.active ? "Active" : "Paused"}</span>
                  <span className="pill">
                    {playlist.resolution_limit ? `${playlist.resolution_limit}p` : "Best"}
                  </span>
                </div>
                <h2>{playlist.title}</h2>
                <p className="card-meta">{playlist.folder_path}</p>
                <p className="card-link">{playlist.source_url}</p>
                <div className="card-actions card-actions-wrap">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setSelectedPlaylistId(playlist.id)}
                  >
                    View videos
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={syncPlaylist.isPending}
                    onClick={() => {
                      setSelectedPlaylistId(playlist.id);
                      syncPlaylist.mutate(playlist.id);
                    }}
                  >
                    {syncPlaylist.isPending && selectedPlaylistId === playlist.id ? "Syncing..." : "Sync"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={downloadNewVideos.isPending}
                    onClick={() => {
                      setSelectedPlaylistId(playlist.id);
                      downloadNewVideos.mutate(playlist.id);
                    }}
                  >
                    {downloadNewVideos.isPending && selectedPlaylistId === playlist.id
                      ? "Downloading..."
                      : "Download new"}
                  </button>
                </div>
              </article>
            ))
          ) : (
            !isLoading && <p className="hint">No playlists saved yet.</p>
          )}
        </div>
        {syncPlaylist.isError && (
          <p className="error-text">
            Sync failed:{" "}
            {syncPlaylist.error instanceof Error ? syncPlaylist.error.message : "Unknown error"}
          </p>
        )}
        {syncPlaylist.data && (
          <p className="hint">
            Synced {syncPlaylist.data.title}: {syncPlaylist.data.new_videos} new /{" "}
            {syncPlaylist.data.total_videos} total
          </p>
        )}
        {downloadNewVideos.isError && (
          <p className="error-text">
            Download failed:{" "}
            {downloadNewVideos.error instanceof Error
              ? downloadNewVideos.error.message
              : "Unknown error"}
          </p>
        )}
        {downloadNewVideos.data && (
          <p className="hint">
            Downloaded {downloadNewVideos.data.downloaded_videos} videos, failed{" "}
            {downloadNewVideos.data.failed_videos}.
          </p>
        )}
      </section>

      <section className="panel panel-spacious">
        <div className="eyebrow">New playlist</div>
        <h1>Add Playlist</h1>
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
                placeholder="Optional, derived from playlist URL"
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
              <input
                value={form.cookies_browser}
                onChange={(event) => updateField("cookies_browser", event.target.value)}
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
              {createPlaylist.error instanceof Error
                ? createPlaylist.error.message
                : "Unknown error"}
            </p>
          )}
        </form>
        <div className="video-section">
          <div className="eyebrow">Selected playlist</div>
          <h2 className="section-title">
            {selectedPlaylist ? "Manage playlist" : "Select a playlist"}
          </h2>
          {selectedPlaylist ? (
            <form className="playlist-form compact-form" onSubmit={handleUpdateSelectedPlaylist}>
              <div className="selected-summary">
                <strong>{selectedPlaylist.title}</strong>
                <p className="card-meta">{selectedPlaylist.folder_path}</p>
                <p className="card-link">{selectedPlaylist.source_url}</p>
              </div>
              <div className="field-grid">
                <label>
                  Title
                  <input
                    value={editForm.title}
                    onChange={(event) => updateEditField("title", event.target.value)}
                  />
                </label>
                <label>
                  Folder name
                  <input
                    value={editForm.folder_name}
                    onChange={(event) => updateEditField("folder_name", event.target.value)}
                  />
                </label>
                <label className="field-span-full">
                  Folder path
                  <input
                    value={editForm.folder_path}
                    onChange={(event) => updateEditField("folder_path", event.target.value)}
                  />
                </label>
                <label>
                  Cookies browser
                  <input
                    value={editForm.cookies_browser}
                    onChange={(event) => updateEditField("cookies_browser", event.target.value)}
                  />
                </label>
                <label>
                  Resolution limit
                  <select
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
                <button className="primary-button" type="submit" disabled={updatePlaylist.isPending}>
                  {updatePlaylist.isPending ? "Saving..." : "Save settings"}
                </button>
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
                  {updatePlaylist.error instanceof Error
                    ? updatePlaylist.error.message
                    : "Unknown error"}
                </p>
              )}
              {deletePlaylist.isError && (
                <p className="error-text">
                  Failed to remove playlist:{" "}
                  {deletePlaylist.error instanceof Error
                    ? deletePlaylist.error.message
                    : "Unknown error"}
                </p>
              )}
            </form>
          ) : (
            <p className="hint">Choose a playlist card to edit settings or remove it.</p>
          )}
        </div>
        <div className="video-section">
          <div className="eyebrow">Discovered videos</div>
          <h2 className="section-title">
            {selectedPlaylistId ? "Selected playlist videos" : "Select a playlist"}
          </h2>
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
                  </div>
                  <span className={`pill video-status ${video.downloaded ? "downloaded-pill" : ""}`}>
                    {video.downloaded ? "Downloaded" : "Missing"}
                  </span>
                </article>
              ))
            ) : (
              selectedPlaylistId &&
              !selectedVideos.isLoading && <p className="hint">No videos synced for this playlist yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
