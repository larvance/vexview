import React, { useState } from 'react';
import { useViewerStore } from '../stores/useViewerStore';
import styles from './InspectorModal.module.css';

export const InspectorModal: React.FC = () => {
  const {
    items,
    currentIndex,
    imageDetail,
    videoDetail,
    showInspector,
    toggleInspector,
  } = useViewerStore();

  const [copied, setCopied] = useState(false);

  const current = items[currentIndex];

  if (!showInspector || !current) return null;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatAspect = (w: number, h: number) => {
    if (!w || !h) return '1:1';
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const d = gcd(w, h);
    const rw = w / d;
    const rh = h / d;
    if ((rw === 16 && rh === 9) || (rw === 4 && rh === 3) || (rw === 1 && rh === 1) || (rw === 21 && rh === 9)) {
      return `${rw}:${rh}`;
    }
    return `${(w / h).toFixed(2)}:1`;
  };

  const handleCopyJson = () => {
    const json = JSON.stringify(
      {
        file: current,
        image: imageDetail,
        video: videoDetail,
      },
      null,
      2
    );
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isVideo = current.media_type === 'Video';
  const isImage = current.media_type === 'Image' || current.media_type === 'AnimatedImage' || current.media_type === 'Svg';

  return (
    <aside className={styles.inspectorDrawer} data-no-drag="true">
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.titleIcon}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <span className={styles.titleText}>Media Inspector</span>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.headerBtn}
            onClick={handleCopyJson}
            title="Copy full metadata as JSON"
          >
            {copied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ color: '#10b981' }}>Copied</span>
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                JSON
              </>
            )}
          </button>

          <button
            className={styles.closeBtn}
            onClick={toggleInspector}
            title="Close Inspector (I)"
            aria-label="Close Inspector"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Card 1: File Information */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>File Overview</span>
            <span className={styles.badge}>{current.media_type.toUpperCase()}</span>
          </div>

          <div className={styles.grid}>
            <span className={styles.label}>Name</span>
            <span className={styles.value} title={current.file_name}>{current.file_name}</span>

            <span className={styles.label}>Size</span>
            <span className={styles.value}>{formatFileSize(current.file_size)}</span>

            <span className={styles.label}>Type</span>
            <span className={styles.value}>{current.media_type}</span>
          </div>

          <div className={styles.pathRow}>
            <span className={styles.pathLabel}>Location</span>
            <div className={styles.pathBox}>{current.path}</div>
          </div>
        </div>

        {/* Card 2: Video Stream Information */}
        {isVideo && videoDetail && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Video Stream</span>
              <span className={styles.badge}>
                {videoDetail.video_codec ? videoDetail.video_codec.toUpperCase() : 'H.264'}
              </span>
            </div>

            <div className={styles.grid}>
              <span className={styles.label}>Resolution</span>
              <span className={styles.value}>
                {videoDetail.width} × {videoDetail.height} ({formatAspect(videoDetail.width, videoDetail.height)})
              </span>

              <span className={styles.label}>Duration</span>
              <span className={styles.value}>{videoDetail.duration_seconds.toFixed(2)} seconds</span>

              {videoDetail.frame_rate && (
                <>
                  <span className={styles.label}>Framerate</span>
                  <span className={styles.value}>{videoDetail.frame_rate.toFixed(2)} FPS</span>
                </>
              )}

              {videoDetail.video_codec && (
                <>
                  <span className={styles.label}>Video Codec</span>
                  <span className={styles.value}>{videoDetail.video_codec.toUpperCase()}</span>
                </>
              )}

              {videoDetail.audio_codec && (
                <>
                  <span className={styles.label}>Audio Codec</span>
                  <span className={styles.value}>{videoDetail.audio_codec.toUpperCase()}</span>
                </>
              )}

              {videoDetail.bit_rate && (
                <>
                  <span className={styles.label}>Bitrate</span>
                  <span className={styles.value}>{(videoDetail.bit_rate / 1000).toFixed(0)} kbps</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Card 3: Image Information */}
        {isImage && imageDetail && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Raster Details</span>
              <span className={styles.badge}>
                {formatAspect(imageDetail.width, imageDetail.height)}
              </span>
            </div>

            <div className={styles.grid}>
              <span className={styles.label}>Dimensions</span>
              <span className={styles.value}>
                {imageDetail.width} × {imageDetail.height} px
              </span>

              <span className={styles.label}>Aspect Ratio</span>
              <span className={styles.value}>
                {formatAspect(imageDetail.width, imageDetail.height)}
              </span>

              {imageDetail.make && (
                <>
                  <span className={styles.label}>Camera</span>
                  <span className={styles.value}>{imageDetail.make} {imageDetail.model || ''}</span>
                </>
              )}

              {imageDetail.date_time && (
                <>
                  <span className={styles.label}>Date / Time</span>
                  <span className={styles.value}>{imageDetail.date_time}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default InspectorModal;
