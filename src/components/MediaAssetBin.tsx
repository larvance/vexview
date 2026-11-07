import React, { useState, useMemo } from 'react';
import { useViewerStore } from '../stores/useViewerStore';
import { pickMediaFiles, probeVideo, probeAudio } from '../lib/ipc';
import styles from './MediaAssetBin.module.css';

interface BinAssetItem {
  id: string;
  path: string;
  fileName: string;
  mediaType: 'Video' | 'Audio' | 'Image';
  duration?: number;
  width?: number;
  height?: number;
}

export const MediaAssetBin: React.FC = () => {
  const { items, addClipToTrack } = useViewerStore();
  const [filter, setFilter] = useState<'all' | 'video' | 'audio' | 'image'>('all');
  const [customAssets, setCustomAssets] = useState<BinAssetItem[]>([]);

  const handleImportFiles = async () => {
    try {
      const selected = await pickMediaFiles();
      if (!selected || selected.length === 0) return;

      const newItems: BinAssetItem[] = [];
      for (const fp of selected) {
        const clean = fp.replace(/^file:\/\//, '');
        const fileName = clean.split('/').pop() || 'media';
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const isVid = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv'].includes(ext);
        const isAud = [
          'mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'm4a', 'opus', 'wma', 'aiff', 'aif', 'mid', 'midi', 'ac3', 'dts', 'alac', 'amr'
        ].includes(ext);

        let dur: number | undefined;
        let w: number | undefined;
        let h: number | undefined;
        let mType: 'Video' | 'Audio' | 'Image' = 'Image';

        if (isVid) {
          mType = 'Video';
          try {
            const meta = await probeVideo(clean);
            dur = meta.duration_seconds;
            w = meta.width;
            h = meta.height;
          } catch {}
        } else if (isAud) {
          mType = 'Audio';
          try {
            const meta = await probeAudio(clean);
            dur = meta.duration_seconds;
          } catch {}
        }

        newItems.push({
          id: `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          path: clean,
          fileName,
          mediaType: mType,
          duration: dur,
          width: w,
          height: h,
        });
      }

      setCustomAssets((prev) => [...prev, ...newItems]);
    } catch (err) {
      console.error('Failed to import media files:', err);
    }
  };

  // Combine custom imported assets with items from the active folder
  const allAssets = useMemo<BinAssetItem[]>(() => {
    const list: BinAssetItem[] = [...customAssets];
    for (const item of items) {
      if (!list.some((a) => a.path === item.path)) {
        list.push({
          id: `item_${item.path}`,
          path: item.path,
          fileName: item.file_name,
          mediaType: item.media_type === 'Video' ? 'Video' : item.media_type === 'Audio' ? 'Audio' : 'Image',
        });
      }
    }
    return list;
  }, [customAssets, items]);

  const filteredAssets = useMemo(() => {
    if (filter === 'all') return allAssets;
    if (filter === 'video') return allAssets.filter((a) => a.mediaType === 'Video');
    if (filter === 'audio') return allAssets.filter((a) => a.mediaType === 'Audio');
    if (filter === 'image') return allAssets.filter((a) => a.mediaType === 'Image');
    return allAssets;
  }, [allAssets, filter]);

  return (
    <aside className={styles.mediaAssetBin}>
      <div className={styles.binHeader}>
        <div className={styles.binTitle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
          </svg>
          Media Bin
        </div>

        <button
          className={styles.importBtn}
          onClick={handleImportFiles}
          title="Import Video, Audio, or SFX files"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Import
        </button>
      </div>

      <div className={styles.filterTabs}>
        <button
          className={`${styles.filterTab} ${filter === 'all' ? styles.active : ''}`}
          onClick={() => setFilter('all')}
        >
          All
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
          Images
        </button>
      </div>

      <div className={styles.assetList}>
        {filteredAssets.length === 0 ? (
          <div className={styles.emptyBin}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div>No assets imported.</div>
            <div style={{ fontSize: '10px' }}>Click Import to add clips, sound effects, or background audio.</div>
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const isVid = asset.mediaType === 'Video';
            const isAud = asset.mediaType === 'Audio';

            return (
              <div key={asset.id} className={styles.assetCard}>
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
                    <span className={styles.assetName} title={asset.fileName}>
                      {asset.fileName}
                    </span>
                    <span className={styles.assetSub}>
                      {asset.duration ? `${asset.duration.toFixed(1)}s` : asset.mediaType}
                      {asset.width ? ` · ${asset.width}x${asset.height}` : ''}
                    </span>
                  </div>
                </div>

                <div className={styles.assetActions}>
                  {isAud ? (
                    <>
                      <button
                        className={styles.addTrackBtn}
                        onClick={() => addClipToTrack(asset.path, 'a1')}
                        title="Add to Track A1 (Dialog / Primary Audio)"
                      >
                        + A1
                      </button>
                      <button
                        className={styles.addTrackBtn}
                        onClick={() => addClipToTrack(asset.path, 'a2')}
                        title="Add to Track A2 (SFX / Music)"
                      >
                        + A2
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={styles.addTrackBtn}
                        onClick={() => addClipToTrack(asset.path, 'v1')}
                        title="Add to Track V1 (Primary Video)"
                      >
                        + V1
                      </button>
                      <button
                        className={styles.addTrackBtn}
                        onClick={() => addClipToTrack(asset.path, 'v2')}
                        title="Add to Track V2 (Overlay / B-Roll)"
                      >
                        + V2
                      </button>
                      {isVid && (
                        <button
                          className={styles.addTrackBtn}
                          onClick={() => addClipToTrack(asset.path, 'a1')}
                          title="Add audio track to A1"
                        >
                          + A1
                        </button>
                      )}
                    </>
                  )}
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
