import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useViewerStore, TrackType, SequenceClip } from '../stores/useViewerStore';
import styles from './StudioTimeline.module.css';

const TRACKS: { id: TrackType; label: string; name: string }[] = [
  { id: 'v2', label: 'V2', name: 'Overlay' },
  { id: 'v1', label: 'V1', name: 'Main Video' },
  { id: 'a1', label: 'A1', name: 'Audio 1' },
  { id: 'a2', label: 'A2', name: 'Audio 2' },
];

export const StudioTimeline: React.FC = () => {
  const {
    sequence,
    selectedClipId,
    setSelectedClipId,
    currentTime,
    seekTo,
    isPlaying,
    setIsPlaying,
    splitClipAtPlayhead,
    deleteSelectedClip,
    duplicateSelectedClip,
    moveClipOnTimeline,
    updateClipTrimRange,
  } = useViewerStore();

  const [pxPerSec, setPxPerSec] = useState<number>(45);
  const [mutedTracks, setMutedTracks] = useState<Record<TrackType, boolean>>({
    v1: false,
    v2: false,
    a1: false,
    a2: false,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingPlayheadRef = useRef<boolean>(false);
  const dragClipRef = useRef<{
    clipId: string;
    action: 'move' | 'trim-start' | 'trim-end';
    startX: number;
    initialTimelineStart: number;
    initialTrimStart: number;
    initialTrimEnd: number;
    duration: number;
    speed: number;
  } | null>(null);

  const totalTimelineDuration = useMemo(() => {
    let max = 15;
    for (const c of sequence) {
      const span = (c.trimEnd - c.trimStart) / c.speed;
      const end = c.timelineStart + span;
      if (end > max) max = end;
    }
    return max + 5;
  }, [sequence]);

  const timelineWidth = Math.max(800, totalTimelineDuration * pxPerSec);

  const formatTimecode = (secs: number) => {
    if (isNaN(secs) || secs < 0) secs = 0;
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  };

  const getTimeFromPointerX = useCallback(
    (clientX: number) => {
      if (!scrollContainerRef.current) return 0;
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const scrollLeft = scrollContainerRef.current.scrollLeft;
      const relativeX = clientX - rect.left + scrollLeft;
      return Math.max(0, Math.min(totalTimelineDuration, relativeX / pxPerSec));
    },
    [pxPerSec, totalTimelineDuration]
  );

  // Ruler pointer scrubbing
  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isDraggingPlayheadRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    const t = getTimeFromPointerX(e.clientX);
    seekTo(t);
  };

  const handleRulerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPlayheadRef.current) return;
    const t = getTimeFromPointerX(e.clientX);
    seekTo(t);
  };

  const handleRulerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingPlayheadRef.current) {
      isDraggingPlayheadRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  // Keyboard shortcut listener for Studio: Space (Play/Pause), S (Split), Del/Backspace (Delete), D (Duplicate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        splitClipAtPlayhead();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedClip();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateSelectedClip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, setIsPlaying, splitClipAtPlayhead, deleteSelectedClip, duplicateSelectedClip]);

  // Window pointer listeners for clip drag & trim
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (!dragClipRef.current) return;
      const {
        clipId,
        action,
        startX,
        initialTimelineStart,
        initialTrimStart,
        initialTrimEnd,
        duration,
        speed,
      } = dragClipRef.current;

      const deltaX = e.clientX - startX;
      const deltaSecs = deltaX / pxPerSec;

      if (action === 'move') {
        const newStart = Math.max(0, initialTimelineStart + deltaSecs);
        moveClipOnTimeline(clipId, newStart);
      } else if (action === 'trim-start') {
        const sourceDelta = deltaSecs * speed;
        const newTrimStart = Math.max(0, Math.min(initialTrimEnd - 0.1, initialTrimStart + sourceDelta));
        const newTimelineStart = initialTimelineStart + (newTrimStart - initialTrimStart) / speed;
        updateClipTrimRange(clipId, newTrimStart, initialTrimEnd);
        moveClipOnTimeline(clipId, Math.max(0, newTimelineStart));
      } else if (action === 'trim-end') {
        const sourceDelta = deltaSecs * speed;
        const newTrimEnd = Math.max(initialTrimStart + 0.1, Math.min(duration, initialTrimEnd + sourceDelta));
        updateClipTrimRange(clipId, initialTrimStart, newTrimEnd);
      }
    };

    const handleGlobalPointerUp = () => {
      dragClipRef.current = null;
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [pxPerSec, moveClipOnTimeline, updateClipTrimRange]);

  const toggleTrackMute = (track: TrackType) => {
    setMutedTracks((prev) => ({ ...prev, [track]: !prev[track] }));
  };

  const rulerTicks = useMemo(() => {
    const ticks: { time: number; major: boolean; label: string }[] = [];
    const step = pxPerSec > 60 ? 1 : pxPerSec > 25 ? 5 : 10;
    for (let t = 0; t <= totalTimelineDuration; t += step) {
      const isMajor = t % (step * 2) === 0 || t === 0;
      ticks.push({
        time: t,
        major: isMajor,
        label: formatTimecode(t),
      });
    }
    return ticks;
  }, [pxPerSec, totalTimelineDuration]);

  const playheadPositionPx = currentTime * pxPerSec;

  return (
    <div className={styles.studioTimeline}>
      {/* 1. Timeline Top Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.playbackCluster}>
          <button
            className={`${styles.playBtn} ${isPlaying ? styles.playing : ''}`}
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>

          <button
            className={styles.controlBtn}
            onClick={() => seekTo(Math.max(0, currentTime - 5))}
            title="Rewind 5s (J / Left)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="3 3 3 8 8 8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            -5s
          </button>

          <button
            className={styles.controlBtn}
            onClick={() => seekTo(Math.min(totalTimelineDuration, currentTime + 5))}
            title="Forward 5s (L / Right)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="21 3 21 8 16 8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            +5s
          </button>

          <div className={styles.timeDisplay}>
            <span>{formatTimecode(currentTime)}</span>
            <span className={styles.timeDuration}>/ {formatTimecode(totalTimelineDuration)}</span>
          </div>
        </div>

        <div className={styles.toolCluster}>
          <button
            className={styles.controlBtn}
            onClick={() => splitClipAtPlayhead()}
            title="Split Clip at Playhead (S)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <line x1="20" y1="4" x2="8.12" y2="15.88" />
              <line x1="14.47" y1="14.48" x2="20" y2="20" />
              <line x1="8.12" y1="8.12" x2="12" y2="12" />
            </svg>
            Split (S)
          </button>

          <button
            className={styles.controlBtn}
            onClick={duplicateSelectedClip}
            disabled={!selectedClipId}
            title="Duplicate Selected Clip (Ctrl+D)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Duplicate
          </button>

          <button
            className={styles.controlBtn}
            onClick={deleteSelectedClip}
            disabled={!selectedClipId}
            title="Delete Selected Clip (Del)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete
          </button>
        </div>

        <div className={styles.zoomCluster}>
          <div className={styles.zoomSliderWrapper}>
            <span>Zoom</span>
            <input
              type="range"
              min="15"
              max="160"
              step="5"
              value={pxPerSec}
              onChange={(e) => setPxPerSec(Number(e.target.value))}
              className={styles.zoomSlider}
              title="Timeline Scale"
            />
          </div>
        </div>
      </div>

      {/* 2. Timeline Workspace (Pinned Headers + Scrollable Tracks) */}
      <div className={styles.timelineWorkspace}>
        {/* Track Headers Column */}
        <div className={styles.trackHeadersColumn}>
          <div className={styles.rulerHeaderPlaceholder}>Tracks</div>
          {TRACKS.map((t) => (
            <div key={t.id} className={styles.trackHeader}>
              <div className={styles.trackInfo}>
                <span className={`${styles.trackBadge} ${styles[t.id]}`}>{t.label}</span>
                <span className={styles.trackLabel}>{t.name}</span>
              </div>
              <button
                className={`${styles.trackMuteBtn} ${mutedTracks[t.id] ? styles.muted : ''}`}
                onClick={() => toggleTrackMute(t.id)}
                title={mutedTracks[t.id] ? "Unmute Track" : "Mute Track"}
              >
                M
              </button>
            </div>
          ))}
        </div>

        {/* Tracks Scrollable Area */}
        <div className={styles.tracksScrollContainer} ref={scrollContainerRef}>
          {/* Timecode Ruler */}
          <div
            className={styles.timecodeRuler}
            style={{ width: `${timelineWidth}px` }}
            onPointerDown={handleRulerPointerDown}
            onPointerMove={handleRulerPointerMove}
            onPointerUp={handleRulerPointerUp}
          >
            {rulerTicks.map((tick) => (
              <div
                key={tick.time}
                className={`${styles.rulerTick} ${tick.major ? styles.rulerTickMajor : ''}`}
                style={{ left: `${tick.time * pxPerSec}px` }}
              >
                {tick.major && <span className={styles.rulerLabel}>{tick.label}</span>}
              </div>
            ))}
          </div>

          {/* Track Lanes */}
          <div className={styles.trackLanesArea} style={{ width: `${timelineWidth}px` }}>
            {TRACKS.map((t) => {
              const trackClips = sequence.filter((c) => c.track === t.id);
              return (
                <div key={t.id} className={styles.trackLane}>
                  {trackClips.map((clip: SequenceClip) => {
                    const spanSecs = (clip.trimEnd - clip.trimStart) / clip.speed;
                    const leftPx = clip.timelineStart * pxPerSec;
                    const widthPx = Math.max(16, spanSecs * pxPerSec);
                    const isSelected = selectedClipId === clip.id;
                    const isAudioTrack = t.id.startsWith('a');

                    return (
                      <div
                        key={clip.id}
                        className={`${styles.clipBlock} ${styles[t.id]} ${isSelected ? styles.selected : ''}`}
                        style={{
                          left: `${leftPx}px`,
                          width: `${widthPx}px`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClipId(clip.id);
                        }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          setSelectedClipId(clip.id);
                          dragClipRef.current = {
                            clipId: clip.id,
                            action: 'move',
                            startX: e.clientX,
                            initialTimelineStart: clip.timelineStart,
                            initialTrimStart: clip.trimStart,
                            initialTrimEnd: clip.trimEnd,
                            duration: clip.duration,
                            speed: clip.speed,
                          };
                        }}
                      >
                        {/* Trim handles */}
                        <div
                          className={styles.trimHandleLeft}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            dragClipRef.current = {
                              clipId: clip.id,
                              action: 'trim-start',
                              startX: e.clientX,
                              initialTimelineStart: clip.timelineStart,
                              initialTrimStart: clip.trimStart,
                              initialTrimEnd: clip.trimEnd,
                              duration: clip.duration,
                              speed: clip.speed,
                            };
                          }}
                          title="Trim In Point"
                        />

                        {isAudioTrack && (
                          <svg className={styles.audioWaveform} viewBox="0 0 100 14" preserveAspectRatio="none">
                            <path
                              d="M0 7 Q 10 1, 20 7 T 40 7 T 60 2 T 80 12 T 100 7"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                          </svg>
                        )}

                        <div className={styles.clipContent}>
                          <span className={styles.clipTitle}>{clip.fileName}</span>
                          <span className={styles.clipDuration}>
                            {(clip.trimEnd - clip.trimStart).toFixed(1)}s
                          </span>
                          {clip.speed !== 1.0 && (
                            <span className={styles.clipSpeedBadge}>{clip.speed}x</span>
                          )}
                        </div>

                        <div
                          className={styles.trimHandleRight}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            dragClipRef.current = {
                              clipId: clip.id,
                              action: 'trim-end',
                              startX: e.clientX,
                              initialTimelineStart: clip.timelineStart,
                              initialTrimStart: clip.trimStart,
                              initialTrimEnd: clip.trimEnd,
                              duration: clip.duration,
                              speed: clip.speed,
                            };
                          }}
                          title="Trim Out Point"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Playhead Needle spanning all lanes */}
            <div
              className={styles.playheadNeedle}
              style={{ transform: `translateX(${playheadPositionPx}px)` }}
            >
              <div
                className={styles.playheadCap}
                onPointerDown={handleRulerPointerDown}
                onPointerMove={handleRulerPointerMove}
                onPointerUp={handleRulerPointerUp}
                title="Playhead Needle"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudioTimeline;
