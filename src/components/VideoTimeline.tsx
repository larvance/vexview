import React, { useRef, useState } from 'react';
import { useViewerStore } from '../stores/useViewerStore';
import { trimVideo, trimAudioClip } from '../lib/ipc';
import { Select, SelectOption } from './ui/Select';
import styles from './VideoTimeline.module.css';

const VIDEO_TRIM_QUALITY_OPTIONS: SelectOption<'original' | 'high' | 'medium' | 'small'>[] = [
  { value: 'original', label: 'Original (Stream Copy)' },
  { value: 'high', label: 'High Quality (CRF 18)' },
  { value: 'medium', label: 'Balanced (CRF 24)' },
  { value: 'small', label: 'Small Size (CRF 30)' },
];

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
    trimRange,
    setTrimRange,
    showFilmstrip,
    toggleFilmstrip,
  } = useViewerStore();

  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingScrubRef = useRef(false);

  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosPercent, setHoverPosPercent] = useState<number>(0);
  const [trimQuality, setTrimQuality] = useState<'original' | 'high' | 'medium' | 'small'>('original');
  const [trimOverwrite, setTrimOverwrite] = useState(false);
  const [isTrimming, setIsTrimming] = useState(false);

  const current = items[currentIndex];

  if (!current || (current.media_type !== 'Video' && current.media_type !== 'Audio')) {
    return null;
  }
  const isAudio = current.media_type === 'Audio';

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

    if (activeMode === 'trim') {
      const [start, end] = trimRange;
      const distToStart = Math.abs(targetTime - start);
      const distToEnd = Math.abs(targetTime - end);
      if (distToStart < distToEnd) {
        setTrimRange([Math.min(targetTime, end - 0.5), end]);
      } else {
        setTrimRange([start, Math.max(targetTime, start + 0.5)]);
      }
    } else {
      seekTo(targetTime);
    }
  };

  const handlePointerMoveTrack = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current || duration <= 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosPercent(ratio * 100);
    setHoverTime(ratio * duration);

    if (isDraggingScrubRef.current) {
      const targetTime = ratio * duration;
      if (activeMode !== 'trim') {
        seekTo(targetTime);
      }
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

  const handleTrimMedia = async () => {
    const [start, end] = trimRange;
    setIsTrimming(true);
    try {
      if (isAudio) {
        await trimAudioClip(current.path, null, start, end, trimQuality, trimOverwrite);
      } else {
        await trimVideo(current.path, null, start, end, trimQuality, trimOverwrite);
      }
    } catch (err) {
      console.error('Trim error:', err);
    } finally {
      setIsTrimming(false);
    }
  };

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const trimStartPercent = duration > 0 ? (trimRange[0] / duration) * 100 : 0;
  const trimEndPercent = duration > 0 ? (trimRange[1] / duration) * 100 : 100;

  return (
    <div className={styles.timelineBar} onPointerDown={(e) => e.stopPropagation()}>
      {/* Optional Trim Mode Drawer Header when Trim is Active */}
      {activeMode === 'trim' && (
        <div className={styles.trimBar}>
          <div className={styles.trimSpanText}>
            Trim: {formatTime(trimRange[0])} → {formatTime(trimRange[1])} (
            {(trimRange[1] - trimRange[0]).toFixed(2)}s)
          </div>

          <div className={styles.trimActions}>
            <Select<'original' | 'high' | 'medium' | 'small'>
              size="sm"
              placement="up"
              value={trimQuality}
              onChange={(val) => setTrimQuality(val)}
              options={VIDEO_TRIM_QUALITY_OPTIONS}
              menuWidth={180}
            />

            <label
              className={`${styles.overwriteLabel} ${trimOverwrite ? styles.warning : ''}`}
              title={trimOverwrite ? 'Will overwrite original file' : 'Saves next to original'}
            >
              <input
                type="checkbox"
                checked={trimOverwrite}
                onChange={(e) => setTrimOverwrite(e.target.checked)}
                className={styles.overwriteCheckbox}
              />
              Overwrite
            </label>

            <button
              className={`${styles.trimBtn} ${trimOverwrite ? styles.overwrite : ''}`}
              onClick={handleTrimMedia}
              disabled={isTrimming}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <line x1="20" y1="4" x2="8.12" y2="15.88" />
                <line x1="14.47" y1="14.48" x2="20" y2="20" />
                <line x1="8.12" y1="8.12" x2="12" y2="12" />
              </svg>
              {isTrimming ? 'Processing...' : trimOverwrite ? 'Overwrite' : 'Cut'}
            </button>
          </div>
        </div>
      )}

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
          {activeMode === 'trim' && (
            <div
              className={styles.trimZone}
              style={{
                left: `${trimStartPercent}%`,
                width: `${Math.max(0, trimEndPercent - trimStartPercent)}%`,
              }}
            />
          )}

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
    </div>
  );
};

export default VideoTimeline;
