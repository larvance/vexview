import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useViewerStore, SequenceClip } from '../stores/useViewerStore';
import styles from './StudioTimeline.module.css';

export const StudioTimeline: React.FC = () => {
  const {
    sequence,
    layers,
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
    addLayer,
    toggleLayerMute,
    addClipToLayer,
    draggedSource,
    undo,
    redo,
    history,
    historyIndex,
  } = useViewerStore();

  const [pxPerSec, setPxPerSec] = useState<number>(45);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [dropPreview, setDropPreview] = useState<{ layerId: string; time: number; duration: number } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const playheadNeedleRef = useRef<HTMLDivElement>(null);
  const isDraggingPlayheadRef = useRef<boolean>(false);
  const isPanningTimelineRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

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
    return max + 10;
  }, [sequence]);

  // Infinite timeline length: extends dynamically with generous infinite buffer
  const timelineWidth = Math.max(window.innerWidth * 3, (totalTimelineDuration + 180) * pxPerSec, 4800 * pxPerSec);

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
      return Math.max(0, relativeX / pxPerSec);
    },
    [pxPerSec]
  );

  // Smooth & perfectly correct playhead positioning via RAF
  useEffect(() => {
    let rafId: number;
    const updatePlayhead = () => {
      if (playheadNeedleRef.current) {
        const x = currentTime * pxPerSec;
        playheadNeedleRef.current.style.transform = `translateX(${x}px)`;
      }
      if (isPlaying) {
        rafId = requestAnimationFrame(updatePlayhead);
      }
    };
    updatePlayhead();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [currentTime, pxPerSec, isPlaying]);

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

  // Keyboard shortcut listener: Space (Play), S (Split), Del/Backspace (Delete), Ctrl+Z (Undo), Ctrl+Y (Redo), Escape (Deselect)
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
      } else if (e.key === 'Escape') {
        setSelectedClipId(null);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateSelectedClip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, setIsPlaying, splitClipAtPlayhead, deleteSelectedClip, duplicateSelectedClip, undo, redo, setSelectedClipId]);

  // Global pointer listeners for clip drag & trim with snapping
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (isPanningTimelineRef.current && scrollContainerRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        scrollContainerRef.current.scrollLeft = Math.max(0, panStartRef.current.scrollLeft - dx);
        scrollContainerRef.current.scrollTop = Math.max(0, panStartRef.current.scrollTop - dy);
        return;
      }

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
        let newStart = Math.max(0, initialTimelineStart + deltaSecs);
        const currentClip = sequence.find((c) => c.id === clipId);
        const span = currentClip ? (currentClip.trimEnd - currentClip.trimStart) / currentClip.speed : 3;

        // Snapping: check magnetic candidates if Shift is NOT held
        if (!e.shiftKey) {
          const snapThreshold = 10 / pxPerSec;
          const candidates: number[] = [0, currentTime];
          for (const c of sequence) {
            if (c.id === clipId) continue;
            const cSpan = (c.trimEnd - c.trimStart) / c.speed;
            candidates.push(c.timelineStart, c.timelineStart + cSpan);
          }

          let snappedTime: number | null = null;
          for (const cand of candidates) {
            // Snap start edge
            if (Math.abs(newStart - cand) < snapThreshold) {
              newStart = cand;
              snappedTime = cand;
              break;
            }
            // Snap end edge
            if (Math.abs(newStart + span - cand) < snapThreshold) {
              newStart = cand - span;
              snappedTime = cand;
              break;
            }
          }
          setSnapLine(snappedTime);
        } else {
          setSnapLine(null);
        }

        moveClipOnTimeline(clipId, newStart);
      } else if (action === 'trim-start') {
        const sourceDelta = deltaSecs * speed;
        let newTrimStart = Math.max(0, Math.min(initialTrimEnd - 0.1, initialTrimStart + sourceDelta));
        let newTimelineStart = initialTimelineStart + (newTrimStart - initialTrimStart) / speed;

        if (!e.shiftKey) {
          const snapThreshold = 10 / pxPerSec;
          if (Math.abs(newTimelineStart - currentTime) < snapThreshold) {
            newTimelineStart = currentTime;
            newTrimStart = initialTrimStart + (newTimelineStart - initialTimelineStart) * speed;
            setSnapLine(currentTime);
          } else {
            setSnapLine(null);
          }
        } else {
          setSnapLine(null);
        }

        updateClipTrimRange(clipId, newTrimStart, initialTrimEnd);
        moveClipOnTimeline(clipId, Math.max(0, newTimelineStart));
      } else if (action === 'trim-end') {
        const sourceDelta = deltaSecs * speed;
        let newTrimEnd = Math.max(initialTrimStart + 0.1, Math.min(duration, initialTrimEnd + sourceDelta));
        const currentClip = sequence.find((c) => c.id === clipId);
        const thisStart = currentClip ? currentClip.timelineStart : initialTimelineStart;
        const clipEndTime = thisStart + (newTrimEnd - initialTrimStart) / speed;

        if (!e.shiftKey) {
          const snapThreshold = 10 / pxPerSec;
          if (Math.abs(clipEndTime - currentTime) < snapThreshold) {
            newTrimEnd = initialTrimStart + (currentTime - thisStart) * speed;
            setSnapLine(currentTime);
          } else {
            setSnapLine(null);
          }
        } else {
          setSnapLine(null);
        }

        updateClipTrimRange(clipId, initialTrimStart, newTrimEnd);
      }
    };

    const handleGlobalPointerUp = () => {
      dragClipRef.current = null;
      isPanningTimelineRef.current = false;
      setSnapLine(null);
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [pxPerSec, sequence, currentTime, moveClipOnTimeline, updateClipTrimRange]);

  // Timeline Canvas Mouse Wheel: ONLY zooms timeline horizontally
  const handleWheelTimelineCanvas = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setPxPerSec((prev) => Math.max(8, Math.min(prev * factor, 300)));
  };

  // Timeline Middle Click: Fits zoom to all sources
  const handleTimelinePointerDown = (e: React.PointerEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      let maxEnd = 0;
      for (const c of sequence) {
        const span = (c.trimEnd - c.trimStart) / c.speed;
        const end = c.timelineStart + span;
        if (end > maxEnd) maxEnd = end;
      }
      if (maxEnd > 0 && scrollContainerRef.current) {
        const containerW = scrollContainerRef.current.clientWidth;
        const fitPx = Math.max(8, Math.min(200, (containerW - 80) / maxEnd));
        setPxPerSec(fitPx);
        scrollContainerRef.current.scrollLeft = 0;
      }
      return;
    }

    // Middle-drag or Space-drag to pan timeline
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanningTimelineRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: scrollContainerRef.current?.scrollLeft || 0,
        scrollTop: scrollContainerRef.current?.scrollTop || 0,
      };
      return;
    }

    // Left click on empty space deselects clip
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (
        target.classList.contains(styles.trackLane) ||
        target.classList.contains(styles.trackLanesArea) ||
        target.classList.contains(styles.tracksScrollContainer)
      ) {
        setSelectedClipId(null);
      }
    }
  };

  const rulerTicks = useMemo(() => {
    const ticks: { time: number; major: boolean; label: string }[] = [];
    const step = pxPerSec > 60 ? 1 : pxPerSec > 25 ? 5 : 10;
    const visibleMax = totalTimelineDuration + 120;
    for (let t = 0; t <= visibleMax; t += step) {
      const isMajor = t % (step * 2) === 0 || t === 0;
      ticks.push({
        time: t,
        major: isMajor,
        label: formatTimecode(t),
      });
    }
    return ticks;
  }, [pxPerSec, totalTimelineDuration]);

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
            onClick={() => seekTo(currentTime + 5)}
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
            onClick={undo}
            disabled={historyIndex <= 0}
            title="Undo (Ctrl+Z)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 14 4 9 9 4" />
              <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
            </svg>
            Undo
          </button>

          <button
            className={styles.controlBtn}
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            title="Redo (Ctrl+Y)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 14 20 9 15 4" />
              <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
            </svg>
            Redo
          </button>

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
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
            Wheel to Zoom · Mid-Click to Fit
          </span>
        </div>
      </div>

      {/* 2. Timeline Workspace (Pinned Headers + Scrollable Tracks) */}
      <div className={styles.timelineWorkspace}>
        {/* Track Headers Column */}
        <div className={styles.trackHeadersColumn}>
          <div className={styles.rulerHeaderPlaceholder}>Layers</div>
          {layers.map((layer) => (
            <div key={layer.id} className={styles.trackHeader}>
              <div className={styles.trackInfo}>
                <span className={`${styles.trackBadge} ${styles.v1}`}>
                  {layer.name}
                </span>
              </div>
              <button
                className={`${styles.trackMuteBtn} ${layer.muted ? styles.muted : ''}`}
                onClick={() => toggleLayerMute(layer.id)}
                title={layer.muted ? "Unmute Layer" : "Mute Layer"}
              >
                M
              </button>
            </div>
          ))}

          {/* Add Layer Header Row */}
          <div className={styles.addLayerRow}>
            <button
              className={styles.addLayerBtn}
              onClick={() => addLayer()}
              title="Add a new Layer below"
            >
              + Add Layer
            </button>
          </div>
        </div>

        {/* Tracks Scrollable Area */}
        <div
          className={styles.tracksScrollContainer}
          ref={scrollContainerRef}
          onWheel={handleWheelTimelineCanvas}
          onPointerDown={handleTimelinePointerDown}
        >
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

          {/* Track Lanes Area */}
          <div className={styles.trackLanesArea} style={{ width: `${timelineWidth}px` }}>
            {layers.map((layer) => {
              const trackClips = sequence.filter((c) => c.layerId === layer.id || c.track === layer.id);

              return (
                <div
                  key={layer.id}
                  className={styles.trackLane}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    const targetTime = getTimeFromPointerX(e.clientX);
                    setDropPreview({
                      layerId: layer.id,
                      time: targetTime,
                      duration: draggedSource?.duration || 4,
                    });
                  }}
                  onDragLeave={() => {
                    setDropPreview(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const targetTime = getTimeFromPointerX(e.clientX);
                    setDropPreview(null);
                    if (draggedSource) {
                      addClipToLayer(draggedSource, layer.id, targetTime);
                    }
                  }}
                >
                  {/* Drop Preview with Striped Border */}
                  {dropPreview && dropPreview.layerId === layer.id && (
                    <div
                      className={styles.dropPreviewTarget}
                      style={{
                        left: `${dropPreview.time * pxPerSec}px`,
                        width: `${Math.max(24, dropPreview.duration * pxPerSec)}px`,
                      }}
                    />
                  )}

                  {trackClips.map((clip: SequenceClip) => {
                    const spanSecs = (clip.trimEnd - clip.trimStart) / clip.speed;
                    const leftPx = clip.timelineStart * pxPerSec;
                    const widthPx = Math.max(16, spanSecs * pxPerSec);
                    const isSelected = selectedClipId === clip.id;
                    const isAudioTrack = clip.mediaType === 'Audio';

                    return (
                      <div
                        key={clip.id}
                        className={`${styles.clipBlock} ${styles.v1} ${isSelected ? styles.selected : ''}`}
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
                          e.stopPropagation();
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

            {/* Drop Zone to Create New Layer on Drag Down */}
            <div
              className={`${styles.addLayerDropzone} ${dropPreview?.layerId === 'new-layer' ? styles.dragOver : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                const targetTime = getTimeFromPointerX(e.clientX);
                setDropPreview({
                  layerId: 'new-layer',
                  time: targetTime,
                  duration: draggedSource?.duration || 4,
                });
              }}
              onDragLeave={() => {
                setDropPreview(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const targetTime = getTimeFromPointerX(e.clientX);
                setDropPreview(null);
                if (draggedSource) {
                  const newL = addLayer();
                  addClipToLayer(draggedSource, newL.id, targetTime);
                }
              }}
            >
              {dropPreview && dropPreview.layerId === 'new-layer' && (
                <div
                  className={styles.dropPreviewTarget}
                  style={{
                    left: `${dropPreview.time * pxPerSec}px`,
                    width: `${Math.max(24, dropPreview.duration * pxPerSec)}px`,
                  }}
                />
              )}
            </div>

            {/* Vertical Magnetic Snap Guideline */}
            {snapLine !== null && (
              <div
                className={styles.snapGuideLine}
                style={{ left: `${snapLine * pxPerSec}px` }}
              />
            )}

            {/* Playhead Needle spanning all lanes */}
            <div
              ref={playheadNeedleRef}
              className={styles.playheadNeedle}
              style={{ transform: `translateX(${currentTime * pxPerSec}px)` }}
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
