import React, { useState, useEffect } from 'react';
import { useViewerStore } from '../stores/useViewerStore';
import {
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  isWindowMaximized,
  startWindowDragging,
} from '../lib/ipc';
import { VexviewMark } from '@aerovex/strata-ui';
import styles from './Titlebar.module.css';

interface TitlebarProps {
  onOpenSettings?: () => void;
  onOpenExport?: () => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({ onOpenSettings, onOpenExport }) => {
  const {
    items,
    currentIndex,
    activeMode,
    setActiveMode,
    requestExitStudio,
    toggleInspector,
    showInspector,
    openMediaFile,
    stopAllPlayback,
    zoom,
    fitScale,
    setZoom,
    centerView,
  } = useViewerStore();

  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    isWindowMaximized().then(setIsMaximized).catch(() => {});

    const handleResize = () => {
      isWindowMaximized().then(setIsMaximized).catch(() => {});
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleToggleMaximize = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const next = await toggleMaximizeWindow();
    setIsMaximized(next);
  };

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    minimizeWindow();
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    stopAllPlayback();
    closeWindow();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea, [data-no-drag="true"]')) {
      return;
    }
    startWindowDragging().catch(() => {});
  };

  const current = items[currentIndex];
  const displayZoom = fitScale > 0 ? Math.round((zoom / fitScale) * 100) : Math.round(zoom * 100);

  return (
    <header
      className={styles.titlebar}
      data-tauri-drag-region="deep"
      onPointerDown={handlePointerDown}
    >
      <div className={styles.leftSection} data-tauri-drag-region="deep">
        <div className={styles.appBrand} data-tauri-drag-region="deep">
          <div className="w-5 h-5 rounded-md bg-[#2c2c29] border border-[#3a3a36] flex items-center justify-center shadow-xs">
            <VexviewMark className="w-3.5 h-3.5 text-[#06b6d4]" />
          </div>
          <span className="font-semibold text-xs tracking-tight text-[#ece9e1]">Vexview</span>
          <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-[#2c2c29] border border-[#3a3a36] text-[#98958c]">
            v0.2.0
          </span>
        </div>

        {activeMode === 'edit' ? (
          <button
            className={styles.exitStudioBtn}
            onClick={() => {
              if (current && current.media_type !== 'Video' && current.media_type !== 'Audio') {
                setActiveMode('view');
              } else {
                requestExitStudio();
              }
            }}
            data-no-drag="true"
            data-tauri-drag-region="false"
            title="Exit Edit Mode (Return to Media View)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Viewer
          </button>
        ) : (
          <button
            className={styles.actionBtn}
            onClick={openMediaFile}
            data-no-drag="true"
            data-tauri-drag-region="false"
            title="Open Media Files (Ctrl+O)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Open...
          </button>
        )}

        {current && (
          <span className={styles.fileName} data-tauri-drag-region="deep" title={current.path}>
            {current.file_name}
          </span>
        )}
      </div>

      <div className={styles.centerSection} data-tauri-drag-region="deep">
        <div className={styles.zoomCluster} data-no-drag="true" data-tauri-drag-region="false">
          <button
            className={styles.zoomBtn}
            onClick={() => setZoom(Math.max(fitScale, zoom * 0.8))}
            title="Zoom Out (-)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <button
            className={`${styles.zoomValue} tabular-nums`}
            onClick={() => centerView()}
            title="Click to Center and Fit (100%)"
          >
            {displayZoom}%
          </button>

          <button
            className={styles.zoomBtn}
            onClick={() => setZoom(zoom * 1.25)}
            title="Zoom In (+)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <button
            className={styles.zoomBtn}
            onClick={() => centerView()}
            title="Center and Fit in Viewport (0)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="7" />
              <line x1="12" y1="1" x2="12" y2="5" strokeLinecap="round" />
              <line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round" />
              <line x1="1" y1="12" x2="5" y2="12" strokeLinecap="round" />
              <line x1="19" y1="12" x2="23" y2="12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className={styles.rightSection} data-tauri-drag-region="deep">
        {activeMode === 'edit' ? (
          <>
            {(current?.media_type === 'Video' || current?.media_type === 'Audio' || !current) && (
              <button
                className={`${styles.actionBtn} ${styles.exportBtn}`}
                onClick={onOpenExport}
                data-no-drag="true"
                data-tauri-drag-region="false"
                title="Export Studio Composition"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export
              </button>
            )}

            <button
              className={styles.actionBtn}
              onClick={onOpenSettings}
              data-no-drag="true"
              data-tauri-drag-region="false"
              title="Settings & Preferences (Ctrl+,)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </button>
          </>
        ) : (
          <>
            {/* For non-videos, display Edit button in top frame right section */}
            {current && current.media_type !== 'Video' && current.media_type !== 'Audio' && (
              <button
                className={styles.actionBtn}
                onClick={() => setActiveMode('edit')}
                data-no-drag="true"
                data-tauri-drag-region="false"
                title="Edit Image (E)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Edit
              </button>
            )}

            <button
              className={`${styles.actionBtn} ${showInspector ? styles.active : ''}`}
              onClick={toggleInspector}
              data-no-drag="true"
              data-tauri-drag-region="false"
              title="EXIF & Media Inspector (I)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              Info
            </button>

            <button
              className={styles.actionBtn}
              onClick={onOpenSettings}
              data-no-drag="true"
              data-tauri-drag-region="false"
              title="Settings & Preferences (Ctrl+,)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Settings
            </button>
          </>
        )}

        {/* Clean, centered window controls */}
        <div className={styles.windowControls} data-no-drag="true" data-tauri-drag-region="false">
          <button
            className={styles.windowControlBtn}
            onClick={handleMinimize}
            title="Minimize"
            aria-label="Minimize"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3.5 8h9" strokeLinecap="round" />
            </svg>
          </button>
          <button
            className={styles.windowControlBtn}
            onClick={() => void handleToggleMaximize()}
            title={isMaximized ? "Restore" : "Maximize"}
            aria-label={isMaximized ? "Restore" : "Maximize"}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              {isMaximized ? (
                <>
                  <rect x="3.5" y="5.5" width="7" height="7" rx="1.2" strokeLinejoin="round" />
                  <path d="M6 5.5V4.2c0-.4.3-.7.7-.7h5.1c.4 0 .7.3.7.7v5.1c0 .4-.3.7-.7.7h-1.3" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" strokeLinejoin="round" />
              )}
            </svg>
          </button>
          <button
            className={`${styles.windowControlBtn} ${styles.closeBtn}`}
            onClick={handleClose}
            title="Close"
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Titlebar;
