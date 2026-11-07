import React, { useRef, useState } from 'react';
import { useViewerStore } from '../stores/useViewerStore';
import styles from './VideoTimeline.module.css';

export const VideoTimeline: React.FC = () => {
  const {
    items,
    currentIndex,
    currentTime,
    duration,
    seekTo,
    isPlaying,
    setIsPlaying,
    isLooping,
    toggleLoop,
    isFullscreen,
    toggleFullscreen,
    activeMode,
    enterStudioMode,
    showFilmstrip,
    toggleFilmstrip,
  } = useViewerStore();

  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingScrubRef = useRef(false);

  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosPercent, setHoverPosPercent] = useState<number>(0);

  const current = items[currentIndex];

  if (activeMode === 'edit' || !current || (current.media_type !== 'Video' && current.media_type !== 'Audio')) {
    return null;
  }

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) secs = 0;
    const mins = Math.floor(secs / 60);
    const remainingSecs = (secs % 60).toFixed(2);
    return `${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(5, '0')}`;
  };

  const getTimeFromPointerEvent = (e: React.PointerEvent | PointerEvent) => {
    if (!trackRef.current || duration <= 0) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const handlePointerDownTrack = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || duration <= 0) return;
    isDraggingScrubRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    const targetTime = getTimeFromPointerEvent(e);
    seekTo(targetTime);
  };

  const handlePointerMoveTrack = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current || duration <= 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosPercent(ratio * 100);
    setHoverTime(ratio * duration);

    if (isDraggingScrubRef.current) {
      const targetTime = ratio * duration;
      seekTo(targetTime);
    }
  };

  const handlePointerUpTrack = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingScrubRef.current) {
      isDraggingScrubRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  const handlePointerLeaveTrack = () => {
    if (!isDraggingScrubRef.current) {
      setHoverTime(null);
    }
  };

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div className={styles.timelineBar} onPointerDown={(e) => e.stopPropagation()}>
      {/* 1. 5sec back */}
      <button
        className={styles.controlBtn}
        onClick={() => seekTo(Math.max(0, currentTime - 5))}
        title="Rewind 5 Seconds (Left Arrow / J)"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="3 3 3 8 8 8" strokeLinecap="round" strokeLinejoin="round" />
          <text x="12" y="15" fontSize="7" fontWeight="bold" textAnchor="middle" fill="currentColor" stroke="none">5</text>
        </svg>
      </button>

      {/* 2. pause / play */}
      <button
        className={`${styles.playBtn} ${isPlaying ? styles.playing : ''}`}
        onClick={() => setIsPlaying(!isPlaying)}
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
      >
        {isPlaying ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>

      {/* 3. 5sec forward */}
      <button
        className={styles.controlBtn}
        onClick={() => seekTo(Math.min(duration, currentTime + 5))}
        title="Forward 5 Seconds (Right Arrow / L)"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="21 3 21 8 16 8" strokeLinecap="round" strokeLinejoin="round" />
          <text x="12" y="15" fontSize="7" fontWeight="bold" textAnchor="middle" fill="currentColor" stroke="none">5</text>
        </svg>
      </button>

      {/* 4. Current Time */}
      <span className={styles.timeText}>{formatTime(currentTime)}</span>

      {/* 5. Progress Bar */}
      <div
        className={styles.progressContainer}
        ref={trackRef}
        onPointerDown={handlePointerDownTrack}
        onPointerMove={handlePointerMoveTrack}
        onPointerUp={handlePointerUpTrack}
        onPointerLeave={handlePointerLeaveTrack}
      >
        <div className={styles.progressTrack}>
          <div
            className={styles.progressBar}
            style={{ width: `${progressPercent}%` }}
          />

          <div
            className={styles.scrubHandle}
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {hoverTime !== null && (
          <div
            className={styles.hoverTooltip}
            style={{ left: `${hoverPosPercent}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      {/* 6. End Time */}
      <span className={styles.timeTextMuted}>{formatTime(duration)}</span>

      {/* 7. Loop Icon */}
      <button
        className={`${styles.controlBtn} ${isLooping ? styles.active : ''}`}
        onClick={toggleLoop}
        title={isLooping ? "Loop Enabled" : "Loop Disabled"}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      </button>

      {/* 8. Fullscreen Icon */}
      <button
        className={`${styles.controlBtn} ${isFullscreen ? styles.active : ''}`}
        onClick={() => toggleFullscreen()}
        title={isFullscreen ? "Exit Fullscreen (F11 / Esc)" : "Fullscreen (F11)"}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      </button>

      {/* 9. Bottom Filmstrip Icon */}
      <button
        className={`${styles.controlBtn} ${showFilmstrip ? styles.active : ''}`}
        onClick={toggleFilmstrip}
        title="Toggle Bottom Filmstrip (B)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="2" y="7" width="20" height="10" rx="2" />
          <line x1="8" y1="7" x2="8" y2="17" />
          <line x1="16" y1="7" x2="16" y2="17" />
        </svg>
      </button>

      {/* 10. Studio Edit Button at the end of progress line */}
      <button
        className={`${styles.controlBtn} ${styles.editBtn}`}
        onClick={enterStudioMode}
        title="Open Studio Editor (E)"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        <span>Edit</span>
      </button>
    </div>
  );
};

export default VideoTimeline;
