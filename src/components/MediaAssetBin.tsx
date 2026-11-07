import React, { useState, useMemo } from 'react';
import { useViewerStore } from '../stores/useViewerStore';
import { pickMediaFiles, openFileDialog } from '../lib/ipc';
import styles from './MediaAssetBin.module.css';

export const MediaAssetBin: React.FC = () => {
  const {
    sources,
    importSources,
    removeSource,
    setDraggedSource,
    addClipToLayer,
    layers,
    saveProject,
    loadProject,
  } = useViewerStore();

  const [filter, setFilter] = useState<'all' | 'video' | 'audio' | 'image'>('all');
  const [isDragOverPanel, setIsDragOverPanel] = useState(false);

  const handleImportFiles = async () => {
    try {
      const selected = await pickMediaFiles();
      if (!selected || selected.length === 0) return;
      await importSources(selected);
    } catch (err) {
      console.error('Failed to import sources:', err);
    }
  };

  const handleOpenProject = async () => {
    try {
      const selected = await openFileDialog();
      if (selected && selected.length > 0 && selected[0].endsWith('.vexedit')) {
        await loadProject(selected[0]);
      }
    } catch (err) {
      console.error('Failed to open project:', err);
    }
  };

  const handleDropOnPanel = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverPanel(false);

    // If files dropped from native OS file manager
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const paths: string[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const f = e.dataTransfer.files[i] as File & { path?: string };
        if (f.path) {
          paths.push(f.path);
        }
      }
      if (paths.length > 0) {
        await importSources(paths);
      }
    }
  };

  const filteredSources = useMemo(() => {
    if (filter === 'all') return sources;
    if (filter === 'video') return sources.filter((a) => a.mediaType === 'Video');
    if (filter === 'audio') return sources.filter((a) => a.mediaType === 'Audio');
    if (filter === 'image') return sources.filter((a) => a.mediaType === 'Image');
    return sources;
  }, [sources, filter]);

  return (
    <aside
      className={`${styles.mediaAssetBin} ${isDragOverPanel ? styles.dragOver : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOverPanel(true);
      }}
      onDragLeave={() => setIsDragOverPanel(false)}
      onDrop={handleDropOnPanel}
    >
      <div className={styles.binHeader}>
        <div className={styles.binTitle}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          Sources
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={styles.importBtn}
            onClick={handleImportFiles}
            title="Import video, audio, or graphics files"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Import
          </button>
        </div>
      </div>

      <div className={styles.projectActionsRow}>
        <button
          className={styles.projectActionBtn}
          onClick={() => saveProject()}
          title="Save project as .vexedit file"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          Save Project
        </button>
        <button
          className={styles.projectActionBtn}
          onClick={handleOpenProject}
          title="Open existing .vexedit project"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Open Project
        </button>
      </div>

      <div className={styles.filterTabs}>
        <button
          className={`${styles.filterTab} ${filter === 'all' ? styles.active : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({sources.length})
        </button>
        <button
          className={`${styles.filterTab} ${filter === 'video' ? styles.active : ''}`}
          onClick={() => setFilter('video')}
        >
          Video
        </button>
        <button
          className={`${styles.filterTab} ${filter === 'audio' ? styles.active : ''}`}
          onClick={() => setFilter('audio')}
        >
          Audio
        </button>
        <button
          className={`${styles.filterTab} ${filter === 'image' ? styles.active : ''}`}
          onClick={() => setFilter('image')}
        >
          Graphics
        </button>
      </div>

      <div className={styles.assetList}>
        {filteredSources.length === 0 ? (
          <div className={styles.emptyBin}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div>No sources added.</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              Drag and drop media files here or click Import to add sources for editing.
            </div>
          </div>
        ) : (
          filteredSources.map((source) => {
            const isVid = source.mediaType === 'Video';
            const isAud = source.mediaType === 'Audio';

            return (
              <div
                key={source.id}
                className={styles.assetCard}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/vexview-source', JSON.stringify(source));
                  e.dataTransfer.effectAllowed = 'copyMove';
                  setDraggedSource(source);
                }}
                onDragEnd={() => {
                  setDraggedSource(null);
                }}
              >
                <div className={styles.assetMetaRow}>
                  <div className={styles.assetIcon}>
                    {isVid ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                      </svg>
                    ) : isAud ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    )}
                  </div>

                  <div className={styles.assetDetails}>
                    <span className={styles.assetName} title={source.fileName}>
                      {source.fileName}
                    </span>
                    <span className={styles.assetSub}>
                      {source.duration ? `${source.duration.toFixed(1)}s` : source.mediaType}
                      {source.width ? ` · ${source.width}x${source.height}` : ''}
                    </span>
                  </div>

                  <button
                    className={styles.removeSourceBtn}
                    onClick={() => removeSource(source.id)}
                    title="Remove from Sources"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                <div className={styles.assetActions}>
                  {layers.map((layer) => (
                    <button
                      key={layer.id}
                      className={styles.addTrackBtn}
                      onClick={() => addClipToLayer(source, layer.id, 0)}
                      title={`Add to ${layer.name}`}
                    >
                      + {layer.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

export default MediaAssetBin;
