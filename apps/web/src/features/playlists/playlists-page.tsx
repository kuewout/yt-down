import { FormEvent, useState } from "react";

import {
  useCreatePlaylist,
  useDownloadNewVideos,
  usePlaylistVideos,
  usePlaylists,
  useSyncPlaylist,
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
  const [form, setForm] = useState<FormState>(initialFormState);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const selectedVideos = usePlaylistVideos(selectedPlaylistId);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await createPlaylist.mutateAsync({
      source_url: form.source_url.trim(),
      title: form.title.trim(),
      folder_name: form.folder_name.trim(),
      folder_path: form.folder_path.trim() || undefined,
      cookies_browser: form.cookies_browser.trim() || null,
      resolution_limit: form.resolution_limit ? Number(form.resolution_limit) : null,
      active: true,
      playlist_id: null,
    });

    setForm(initialFormState);
  }

  return (
    <div className="split-layout">
      <section className="panel">
        <div className="eyebrow">Tracked playlists</div>
        <h1>Playlists</h1>
        <p className="lede">
          Create playlist records now; sync and download actions are the next backend slice.
        </p>
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
                <div className="card-actions">
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

      <section className="panel">
        <div className="eyebrow">New playlist</div>
        <h1>Add Playlist</h1>
        <form className="playlist-form" onSubmit={handleSubmit}>
          <label>
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
              required
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
            />
          </label>
          <label>
            Folder name
            <input
              required
              value={form.folder_name}
              onChange={(event) => updateField("folder_name", event.target.value)}
            />
          </label>
          <label>
            Folder path
            <input
              required
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
          <button className="primary-button" type="submit" disabled={createPlaylist.isPending}>
            {createPlaylist.isPending ? "Saving..." : "Create playlist"}
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
                  <div>
                    <strong>{video.title}</strong>
                    <p className="card-meta">
                      {video.upload_date ?? "Unknown date"} · {video.video_id}
                    </p>
                  </div>
                  <span className={`pill ${video.downloaded ? "downloaded-pill" : ""}`}>
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
