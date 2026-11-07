import React, { useRef, useState, useEffect, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useViewerStore } from '../stores/useViewerStore';
import { audioEngine } from '../lib/audioEngine';
import { getVideoStreamUrl } from '../lib/ipc';
import { CropOverlay } from './CropOverlay';
import { CropControlBar } from './CropControlBar';
import { AnnotationLayer } from './AnnotationLayer';
import { ToolPalette } from './ToolPalette';
import styles from './Viewport.module.css';

const getSafeArea = (viewportEl: HTMLElement) => {
  const viewportRect = viewportEl.getBoundingClientRect();
  const horizontalPadding = 4;
  const verticalPadding = 4;

  const availableWidth = Math.max(50, viewportRect.width - (horizontalPadding * 2));
  const availableHeight = Math.max(50, viewportRect.height - (verticalPadding * 2));

  return {
    availableWidth,
    availableHeight,
    targetPanX: 0,
    targetPanY: 0,
  };
};

export const Viewport: React.FC = () => {
  const {
    items,
    currentIndex,
    imageDetail,
    videoDetail,
    audioDetail,
    sequence,
    selectedClipId,
    newTimelineProject,
    loading,
    error,
    zoom,
    fitScale,
    setFitScale,
    pan,
    setPan,
    setZoomAndPan,
    setCenterViewAction,
    activeMode,
    setActiveMode,
    editor,
    updateEditor,
    isPlaying,
    isLooping,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    seekTime,
    openMediaFile,
    openMediaFolder,
    activeSubTool,
    setActiveSubTool,
    undoAnnotation,
    redoAnnotation,
    copyNotice,
    copyCurrentToClipboard,
  } = useViewerStore();

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const fitScaleRef = useRef(fitScale);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const wheelRafRef = useRef<number | null>(null);

  useEffect(() => {
    fitScaleRef.current = fitScale;
  }, [fitScale]);

  const [isSplitting, setIsSplitting] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const current = items[currentIndex];
  const isVideo = current?.media_type === 'Video';
  const isAudio = current?.media_type === 'Audio';

  const formatAudioTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleAudioProgressPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || duration <= 0) return;
    const trackEl = e.currentTarget;
    try {
      trackEl.setPointerCapture(e.pointerId);
    } catch (_) {}

    const updateProgress = (clientX: number) => {
      const rect = trackEl.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newTime = ratio * duration;
      audioEngine.seek(newTime);
    };

    updateProgress(e.clientX);

    const onPointerMove = (moveEvent: PointerEvent) => {
      updateProgress(moveEvent.clientX);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        trackEl.releasePointerCapture(upEvent.pointerId);
      } catch (_) {}
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (newVol > 0 && isMuted) {
      setIsMuted(false);
    }
    audioEngine.setVolume(newVol);
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioEngine.setMuted(nextMuted);
  };

  const activeStudioClip = activeMode === 'edit'
    ? (sequence.find((c) => c.id === selectedClipId) || (sequence.length > 0 ? sequence[0] : null))
    : null;

  // Synchronize video element audio parameters and studio clip parameters
  useEffect(() => {
    if (videoRef.current) {
      if (activeStudioClip) {
        videoRef.current.playbackRate = activeStudioClip.speed || 1.0;
        videoRef.current.volume = activeStudioClip.mute ? 0 : Math.min(1.0, activeStudioClip.volume);
        videoRef.current.muted = activeStudioClip.mute;
      } else {
        videoRef.current.playbackRate = 1.0;
        videoRef.current.volume = isMuted ? 0 : volume;
        videoRef.current.muted = isMuted;
      }
    }
  }, [volume, isMuted, isVideo, activeStudioClip?.speed, activeStudioClip?.volume, activeStudioClip?.mute, activeStudioClip]);

  // Clear video errors when active media changes
  useEffect(() => {
    setVideoError(null);
  }, [current?.path]);

  // Synchronize internal refs with store coordinates
  useEffect(() => {
    panRef.current = pan;
    zoomRef.current = zoom;
    if (canvasRef.current && !isDraggingRef.current) {
      canvasRef.current.style.transform = `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoom})`;
    }
  }, [pan, zoom]);

  // Tactile keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          copyCurrentToClipboard();
          return;
        }
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) {
            redoAnnotation();
          } else {
            undoAnnotation();
          }
          return;
        }
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          redoAnnotation();
          return;
        }
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
          case 'm':
            setActiveSubTool('select');
            break;
          case 'c':
            setActiveSubTool('crop');
            break;
          case 'p':
            setActiveSubTool('pen');
            break;
          case 'h':
            setActiveSubTool('highlighter');
            break;
          case 'l':
            setActiveSubTool('line');
            break;
          case 'a':
            setActiveSubTool('arrow');
            break;
          case 'r':
            if (e.shiftKey) {
              setActiveSubTool('rect_fill');
            } else {
              setActiveSubTool('rect');
            }
            break;
          case 'o':
            if (e.shiftKey) {
              setActiveSubTool('ellipse_fill');
            } else {
              setActiveSubTool('ellipse');
            }
            break;
          case 'b':
          case 'g':
            setActiveSubTool('blur_rect');
            break;
          case 't':
            setActiveSubTool('text');
            break;
          case 'e':
            setActiveSubTool('eraser');
            break;
          case 'i':
            setActiveSubTool('eyedropper');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveSubTool, undoAnnotation, redoAnnotation]);

  // Center and fit media in the safe area between top tools and bottom bar with padding
  const centerAndFitMedia = useCallback((overrideW?: number, overrideH?: number) => {
    const el = viewportRef.current;
    if (!el || !current) return;

    const isVid = current.media_type === 'Video';
    const isAud = current.media_type === 'Audio';

    if (isAud) {
      panRef.current = { x: 0, y: 0 };
      zoomRef.current = 1.0;
      setZoomAndPan(1.0, { x: 0, y: 0 });
      return;
    }

    const naturalW = overrideW
      || (isVid ? (videoDetail?.width || videoRef.current?.videoWidth) : (imageDetail?.width || imgRef.current?.naturalWidth));

    const naturalH = overrideH
      || (isVid ? (videoDetail?.height || videoRef.current?.videoHeight) : (imageDetail?.height || imgRef.current?.naturalHeight));

    const mw = naturalW && naturalW > 0 ? naturalW : 1920;
    const mh = naturalH && naturalH > 0 ? naturalH : 1080;

    const { availableWidth, availableHeight, targetPanX, targetPanY } = getSafeArea(el);

    const scaleX = availableWidth / mw;
    const scaleY = availableHeight / mh;
    const computedFitScale = Math.max(0.001, Number(Math.min(scaleX, scaleY).toFixed(4)));

    setFitScale(computedFitScale);
    fitScaleRef.current = computedFitScale;
    const targetZoom = computedFitScale;
    const newPan = { x: targetPanX, y: targetPanY };

    panRef.current = newPan;
    zoomRef.current = targetZoom;

    if (canvasRef.current) {
      canvasRef.current.style.transform = `translate3d(${newPan.x}px, ${newPan.y}px, 0px) scale(${targetZoom})`;
    }

    setZoomAndPan(targetZoom, newPan);
  }, [current, videoDetail, imageDetail, setZoomAndPan, setFitScale]);

  // Expose centerAndFitMedia to store
  useEffect(() => {
    setCenterViewAction(centerAndFitMedia);
    return () => setCenterViewAction(null);
  }, [centerAndFitMedia, setCenterViewAction]);

  // Initial auto-centering on media change, metadata arrival, or mode change
  useEffect(() => {
    if (current) {
      centerAndFitMedia();
      const timer = setTimeout(() => {
        centerAndFitMedia();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [
    current?.path,
    videoDetail?.width,
    videoDetail?.height,
    imageDetail?.width,
    imageDetail?.height,
    activeMode,
    centerAndFitMedia,
  ]);

  // Re-fit on window resize
  useEffect(() => {
    const handleResize = () => {
      centerAndFitMedia();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [centerAndFitMedia]);

  const clampPanToBounds = useCallback(
    (panX: number, panY: number, targetZoom: number) => {
      const fit = fitScaleRef.current || 1.0;
      if (targetZoom <= fit + 0.001) {
        return { x: 0, y: 0 };
      }
      const vpEl = viewportRef.current;
      if (!vpEl) return { x: 0, y: 0 };
      const vpW = vpEl.clientWidth;
      const vpH = vpEl.clientHeight;
      const isVid = current?.media_type === 'Video';
      const natW =
        (isVid
          ? videoDetail?.width || videoRef.current?.videoWidth
          : imageDetail?.width || imgRef.current?.naturalWidth) || vpW;
      const natH =
        (isVid
          ? videoDetail?.height || videoRef.current?.videoHeight
          : imageDetail?.height || imgRef.current?.naturalHeight) || vpH;
      const renderedW = natW * targetZoom;
      const renderedH = natH * targetZoom;
      const maxPanX = Math.max(0, (renderedW - vpW) / 2);
      const maxPanY = Math.max(0, (renderedH - vpH) / 2);
      return {
        x: Math.max(-maxPanX, Math.min(maxPanX, panX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, panY)),
      };
    },
    [current, videoDetail, imageDetail]
  );

  // Window-level non-passive wheel listener:
  // Mouse scroll should ONLY zoom the video, anchored to mouse cursor. No scroll-panning.
  useEffect(() => {
    const handleWheelNative = (e: WheelEvent) => {
      // Allow native scrolling inside form controls, drawers, modals, titlebars, and filmstrip
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, select, [data-no-wheel="true"]') ||
        target?.closest('[data-modal="true"], .modal') ||
        target?.closest('[data-drawer="true"], aside') ||
        target?.closest('header, [data-role="titlebar"]') ||
        target?.closest('[data-role="filmstrip"]') ||
        target?.closest('[data-role="timeline"], [class*="StudioTimeline"]')
      ) {
        return;
      }

      // If no media loaded or if audio file, do not capture wheel
      if (!current || isAudio) return;

      e.preventDefault();

      let dy = e.deltaY;
      if (e.deltaMode === 1) {
        dy *= 24;
      } else if (e.deltaMode === 2) {
        dy *= 400;
      }

      const absDy = Math.abs(dy);
      if (absDy < 1) return;

      let factor: number;
      if (absDy < 30) {
        factor = Math.exp(-dy * 0.01);
      } else {
        // Scroll up zooms in, scroll down zooms out
        factor = dy < 0 ? 1.15 : 0.85;
      }

      const currentZoom = zoomRef.current;
      const minZ = fitScaleRef.current || 0.05;
      const newZoom = Math.max(minZ, Math.min(currentZoom * factor, minZ * 32.0));

      if (newZoom !== currentZoom) {
        if (newZoom <= minZ + 0.001) {
          panRef.current = { x: 0, y: 0 };
          zoomRef.current = minZ;
        } else {
          const el = viewportRef.current || document.body;
          const rect = el.getBoundingClientRect();
          const cursorX = e.clientX - (rect.left + rect.width / 2);
          const cursorY = e.clientY - (rect.top + rect.height / 2);
          const scaleRatio = newZoom / currentZoom;
          const newPanX = cursorX - (cursorX - panRef.current.x) * scaleRatio;
          const newPanY = cursorY - (cursorY - panRef.current.y) * scaleRatio;

          panRef.current = clampPanToBounds(Math.round(newPanX), Math.round(newPanY), newZoom);
          zoomRef.current = newZoom;
        }

        if (canvasRef.current) {
          canvasRef.current.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0px) scale(${zoomRef.current})`;
        }

        if (wheelRafRef.current === null) {
          wheelRafRef.current = requestAnimationFrame(() => {
            wheelRafRef.current = null;
            setZoomAndPan(zoomRef.current, panRef.current);
          });
        }
      }
    };

    window.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheelNative);
      if (wheelRafRef.current !== null) {
        cancelAnimationFrame(wheelRafRef.current);
        wheelRafRef.current = null;
      }
    };
  }, [current, isAudio, setZoomAndPan, clampPanToBounds]);

  // Pointer drag pan: middle-click or right-click in ANY mode (including edit mode); left-click in view mode or select tool
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isAudio) return;
    const isMiddleClick = e.button === 1;
    const isRightClick = e.button === 2;
    const isLeftClick = e.button === 0;

    const canPan = isMiddleClick || isRightClick || (isLeftClick && (activeMode !== 'edit' || activeSubTool === 'select'));
    if (!canPan) return;

    if (isMiddleClick || isRightClick) {
      e.preventDefault();
    }

    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        'button, input, select, textarea, [data-role="tool-palette"], [data-role="floating-hud"], [data-role="video-timeline"], [data-no-pan="true"], [class*="toolPalette"], [class*="hud"]'
      )
    ) {
      return;
    }
    if (target?.closest(`.${styles.splitHandle}`)) return;
    if (target?.closest(`.${styles.buttonGroup}`)) return;

    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX - panRef.current.x,
      y: e.clientY - panRef.current.y,
    };

    if (viewportRef.current) {
      viewportRef.current.dataset.dragging = 'true';
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isSplitting && viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      updateEditor({ splitPosition: pos });
      return;
    }

    if (!isDraggingRef.current) return;

    const fit = fitScaleRef.current || 1.0;
    if (zoomRef.current <= fit + 0.001) {
      // Strictly no panning when at 100% (fit)
      panRef.current = { x: 0, y: 0 };
      return;
    }

    const rawX = e.clientX - dragStartRef.current.x;
    const rawY = e.clientY - dragStartRef.current.y;
    panRef.current = clampPanToBounds(rawX, rawY, zoomRef.current);

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (canvasRef.current) {
          canvasRef.current.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0px) scale(${zoomRef.current})`;
        }
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isSplitting) {
      setIsSplitting(false);
    }

    if (isDraggingRef.current) {
      isDraggingRef.current = false;

      if (viewportRef.current) {
        viewportRef.current.dataset.dragging = 'false';
      }

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (canvasRef.current) {
        canvasRef.current.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0px) scale(${zoomRef.current})`;
      }

      setPan(panRef.current);
    }
  };

  // Double click toggles between fit (1.0) and 2.5x zoom
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isAudio || activeSubTool !== 'select') return;

    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        'button, input, select, textarea, [data-role="tool-palette"], [data-role="floating-hud"], [data-role="video-timeline"], [data-no-pan="true"], [class*="toolPalette"], [class*="hud"]'
      )
    ) {
      return;
    }
    if (target?.closest(`.${styles.splitHandle}`)) return;
    if (target?.closest(`.${styles.buttonGroup}`)) return;

    if (zoom <= 1.05 && viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const offsetX = e.clientX - (rect.left + rect.width / 2);
      const offsetY = e.clientY - (rect.top + rect.height / 2);
      const newZoom = 2.5;
      const scaleRatio = newZoom / zoom;
      const newPanX = offsetX - (offsetX - panRef.current.x) * scaleRatio;
      const newPanY = offsetY - (offsetY - panRef.current.y) * scaleRatio;
      const updatedPan = { x: Math.round(newPanX), y: Math.round(newPanY) };

      panRef.current = updatedPan;
      zoomRef.current = newZoom;

      if (canvasRef.current) {
        canvasRef.current.style.transform = `translate3d(${updatedPan.x}px, ${updatedPan.y}px, 0px) scale(${newZoom})`;
      }

      setZoomAndPan(newZoom, updatedPan);
    } else {
      centerAndFitMedia();
    }
  };

  // Synchronize HTML5 video element with isPlaying state
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    if (isPlaying) {
      if (videoRef.current.paused) {
        const promise = videoRef.current.play();
        if (promise !== undefined) {
          promise.catch((err) => {
            console.debug('Video autoplay/play was deferred or aborted:', err);
          });
        }
      }
    } else {
      if (!videoRef.current.paused) {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, isVideo]);

  // Handle seeking from timeline
  useEffect(() => {
    if (isVideo && seekTime !== null && videoRef.current) {
      videoRef.current.currentTime = seekTime;
    }
  }, [isVideo, seekTime]);

  if (!current) {
    if (sequence.length > 0) {
      return (
        <div ref={viewportRef} className={styles.viewport}>
          <div className={styles.emptyState} style={{ maxWidth: 440 }}>
            <svg
              className={styles.emptyIcon}
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#a855f7"
              strokeWidth="1.5"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M7 4v16M17 4v16M2 12h20M2 8h5M2 16h5M17 8h5M17 16h5" />
            </svg>
            <div className={styles.emptyTitle}>Composition Storyboard Active</div>
            <div className={styles.emptySubtitle}>
              {sequence.length} media clip{sequence.length === 1 ? '' : 's'} staged in timeline storyboard.
              Rearrange, trim, and render directly in the Studio Drawer.
            </div>
            <div className={styles.buttonGroup}>
              <button
                className={styles.primaryBtn}
                onClick={() => setActiveMode('edit')}
                title="Open Studio Sequencer Drawer"
              >
                Open Sequence Studio
              </button>
              <button
                className={styles.secondaryBtn}
                onClick={openMediaFile}
                title="Open another media file"
              >
                Browse Media...
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div ref={viewportRef} className={styles.viewport}>
        <div className={styles.emptyState}>
          <svg
            className={styles.emptyIcon}
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <div className={styles.emptyTitle}>No media loaded</div>
          <div className={styles.emptySubtitle}>
            Select an image, video, or audio track to preview, or create a new composition
          </div>
          <div className={styles.buttonGroup}>
            <button
              className={styles.primaryBtn}
              onClick={openMediaFile}
              title="Open File (Ctrl+O)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              Open Media...
            </button>
            <button
              className={styles.secondaryBtn}
              onClick={openMediaFolder}
              title="Open Folder"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Open Folder...
            </button>
            <button
              className={styles.secondaryBtn}
              onClick={() => newTimelineProject('video')}
              title="Create a new composition project from scratch"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Project
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activePath = activeStudioClip ? activeStudioClip.path : current.path;
  const activeIsVideo = activeStudioClip ? activeStudioClip.mediaType === 'Video' : isVideo;
  const assetUrl = convertFileSrc(activePath);
  const streamUrl = activeIsVideo ? getVideoStreamUrl(activePath, assetUrl) : assetUrl;
  const videoSrc = activeIsVideo
    ? (videoDetail?.stream_url || streamUrl)
    : assetUrl;
  const displaySrc =
    editor.previewUrl ||
    (current.media_type === 'Svg' && imageDetail?.data_url ? imageDetail.data_url : (imageDetail?.data_url || assetUrl));

  const mediaWidth = isVideo
    ? (videoDetail?.width || 1920)
    : isAudio
    ? 520
    : (imageDetail?.width || imgRef.current?.naturalWidth || 1920);

  const mediaHeight = isVideo
    ? (videoDetail?.height || 1080)
    : isAudio
    ? 380
    : (imageDetail?.height || imgRef.current?.naturalHeight || 1080);

  const getFilterStyle = () => {
    if (activeStudioClip) {
      const b = 100 + activeStudioClip.brightness;
      const c = Math.round(activeStudioClip.contrast * 100);
      const s = Math.round(activeStudioClip.saturation * 100);
      return `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
    }
    let filterStr = `brightness(${100 + editor.brightness}%) contrast(${100 + editor.contrast}%) blur(${editor.blur}px) saturate(${100 + editor.saturation}%)`;
    if (editor.filter === 'grayscale') {
      filterStr += ' grayscale(100%)';
    } else if (editor.filter === 'invert') {
      filterStr += ' invert(100%)';
    } else if (editor.filter === 'sepia') {
      filterStr += ' sepia(85%)';
    }
    if (editor.warmth > 0) {
      filterStr += ` sepia(${editor.warmth * 0.4}%)`;
    } else if (editor.warmth < 0) {
      filterStr += ` hue-rotate(${editor.warmth * 0.3}deg)`;
    }
    return filterStr;
  };

  return (
    <div
      ref={viewportRef}
      className={styles.viewport}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
      onAuxClick={(e) => e.preventDefault()}
    >
      {/* Floating Studio Tool Palette: only visible in edit mode for raster/svg */}
      {activeMode === 'edit' && !isVideo && !isAudio && <ToolPalette />}

      {/* Fixed Capsule Crop Action Bar: only visible when crop tool is active */}
      {activeSubTool === 'crop' && !isVideo && !isAudio && <CropControlBar />}

      {/* Copy to Clipboard Notification Toast */}
      {copyNotice && (
        <div className={styles.copyToast}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Copied image to clipboard</span>
        </div>
      )}

      {/* Video Decode / Playback Error Toast */}
      {videoError && (
        <div className={styles.copyToast} style={{ background: 'rgba(220, 38, 38, 0.95)', border: '1px solid rgba(248, 113, 113, 0.4)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{videoError}</span>
        </div>
      )}

      {loading && !displaySrc && (
        <div style={{ position: 'absolute', color: '#94a3b8', fontSize: '12px' }}>
          Loading media...
        </div>
      )}
      {error && !displaySrc && (
        <div style={{ position: 'absolute', color: '#ef4444', fontSize: '13px', background: 'rgba(0,0,0,0.7)', padding: '8px 16px', borderRadius: '8px' }}>
          Failed to load media: {error}
        </div>
      )}

      {isAudio ? (
        <div className={styles.audioViewportContainer}>
          <div className={styles.audioProgressCard} data-role="audio-card">
            {/* Header: File Name, Badge, Spec Pill, Edit Mode Button */}
            <div className={styles.audioHeaderRow}>
              <div className={styles.audioMetaLeft}>
                <div className={styles.audioFileIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <span className={styles.audioTitleText} title={current.file_name}>
                  {audioDetail?.title || current.file_name}
                </span>
                <span className={styles.audioBadgeTag}>
                  {audioDetail?.audio_codec
                    ? audioDetail.audio_codec.toUpperCase()
                    : (current.file_name.split('.').pop()?.toUpperCase() || 'AUDIO')}
                </span>
              </div>

              <div className={styles.audioHeaderRight}>
                {audioDetail?.sample_rate && (
                  <span className={styles.audioSpecPill}>
                    {audioDetail.sample_rate >= 1000
                      ? `${(audioDetail.sample_rate / 1000).toFixed(1)} kHz`
                      : `${audioDetail.sample_rate} Hz`}
                  </span>
                )}
                {audioDetail?.channels && (
                  <span className={styles.audioSpecPill}>
                    {audioDetail.channels === 1
                      ? 'Mono'
                      : audioDetail.channels === 2
                      ? 'Stereo'
                      : `${audioDetail.channels}ch`}
                  </span>
                )}
                <button
                  className={styles.audioEditModeBtn}
                  onClick={() => setActiveMode(activeMode === 'edit' ? 'view' : 'edit')}
                  title="Open in Video / Audio Editor (E)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  {activeMode === 'edit' ? 'Close Editor' : 'Edit'}
                </button>
              </div>
            </div>

            {/* Controls: Play/Pause button, Progress Scrubber, Timecode, Volume */}
            <div className={styles.audioControlsRow}>
              <button
                className={styles.audioMainPlayBtn}
                onClick={() => setIsPlaying(!isPlaying)}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
              </button>

              <div className={styles.audioProgressBarSection}>
                <div
                  className={styles.audioProgressTrack}
                  onPointerDown={handleAudioProgressPointerDown}
                  title="Click or drag to seek"
                >
                  <div
                    className={styles.audioProgressFill}
                    style={{
                      width: `${duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0}%`,
                    }}
                  >
                    <div className={styles.audioProgressThumb} />
                  </div>
                </div>

                <div className={styles.audioTimeDisplayRow}>
                  <span>{formatAudioTime(currentTime)}</span>
                  <span>{formatAudioTime(duration)}</span>
                </div>
              </div>

              <div className={styles.audioVolumeSection}>
                <button
                  className={styles.audioVolumeIconBtn}
                  onClick={handleToggleMute}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                  ) : volume < 0.5 ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className={styles.audioVolumeRange}
                  title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={canvasRef}
          className={styles.canvasContainer}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoom})`,
          }}
        >
          <div style={{ position: 'relative', display: 'inline-block' }}>
            {isVideo ? (
              <video
                ref={videoRef}
                src={videoSrc}
                className={styles.videoElement}
                onLoadedMetadata={(e) => {
                  const vid = e.currentTarget;
                  if (vid.duration > 0) setDuration(vid.duration);
                  if (vid.videoWidth > 0 && vid.videoHeight > 0) {
                    centerAndFitMedia(vid.videoWidth, vid.videoHeight);
                  } else {
                    centerAndFitMedia();
                  }
                }}
                onCanPlay={(e) => {
                  const vid = e.currentTarget;
                  if (vid.videoWidth > 0 && vid.videoHeight > 0) {
                    centerAndFitMedia(vid.videoWidth, vid.videoHeight);
                  }
                  if (isPlaying && videoRef.current && videoRef.current.paused) {
                    videoRef.current.play().catch(() => {});
                  }
                }}
                onPlay={() => {
                  if (!isPlaying) setIsPlaying(true);
                }}
                onPause={() => {
                  if (isPlaying) setIsPlaying(false);
                }}
                onError={(e) => {
                  const err = (e.target as HTMLVideoElement).error;
                  let msg = 'Failed to load video stream.';
                  if (err) {
                    if (err.code === 4) {
                      msg = 'Video codec or format is not supported by system media decoders.';
                    } else if (err.code === 3) {
                      msg = 'Video decoding error occurred during playback.';
                    } else if (err.code === 2) {
                      msg = 'Network or streaming error while loading video.';
                    }
                  }
                  console.error('Video element playback error:', err);
                  setVideoError(msg);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlaying(!isPlaying);
                }}
                onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                onEnded={() => {
                  if (!isLooping) {
                    setIsPlaying(false);
                  }
                }}
                onStalled={() => {
                  if (isPlaying && videoRef.current && videoRef.current.paused) {
                    videoRef.current.play().catch(() => {});
                  }
                }}
                loop={isLooping}
                playsInline
                style={{
                  transform: activeStudioClip
                    ? `rotate(${activeStudioClip.rotation}deg) scale(${activeStudioClip.scale}) scaleX(${activeStudioClip.flipH ? -1 : 1}) scaleY(${activeStudioClip.flipV ? -1 : 1})`
                    : undefined,
                  opacity: activeStudioClip ? activeStudioClip.opacity : 1,
                  filter: getFilterStyle(),
                }}
              />
            ) : activeMode === 'edit' && editor.previewUrl ? (
              /* Split comparison mode */
              <div className={styles.splitContainer}>
                <img
                  ref={imgRef}
                  src={imageDetail?.data_url || assetUrl}
                  alt="Original"
                  className={styles.splitOriginal}
                  onLoad={() => centerAndFitMedia()}
                />
                <div
                  className={styles.splitEdited}
                  style={{ width: `${editor.splitPosition}%` }}
                >
                  <img
                    src={editor.previewUrl}
                    alt="Edited"
                    style={{
                      transform: `rotate(${editor.rotation}deg) scaleX(${editor.flipH ? -1 : 1}) scaleY(${editor.flipV ? -1 : 1})`,
                      filter: getFilterStyle(),
                    }}
                  />
                </div>
                <div
                  className={styles.splitHandle}
                  style={{ left: `${editor.splitPosition}%` }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setIsSplitting(true);
                  }}
                >
                  <div className={styles.handleGrip}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 8L22 12L18 16" />
                      <path d="M6 8L2 12L6 16" />
                      <path d="M2 12H22" />
                    </svg>
                  </div>
                </div>
              </div>
            ) : (
              <img
                ref={imgRef}
                src={displaySrc}
                alt={current.file_name}
                className={styles.imageElement}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    centerAndFitMedia(img.naturalWidth, img.naturalHeight);
                  } else {
                    centerAndFitMedia();
                  }
                }}
                style={{
                  transform: `rotate(${editor.rotation}deg) scaleX(${editor.flipH ? -1 : 1}) scaleY(${editor.flipV ? -1 : 1})`,
                  filter: getFilterStyle(),
                }}
              />
            )}

            {/* High-DPI Vector Annotation Layer for raster/svg */}
            {!isVideo && (
              <AnnotationLayer
                mediaWidth={mediaWidth}
                mediaHeight={mediaHeight}
                imageElement={imgRef.current}
                displaySrc={displaySrc}
              />
            )}

            {/* Interactive 8-Anchor Crop Overlay for raster images */}
            {activeSubTool === 'crop' && !isVideo && (
              <CropOverlay
                mediaWidth={mediaWidth}
                mediaHeight={mediaHeight}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
