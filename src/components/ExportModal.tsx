import React, { useState } from 'react';
import { useViewerStore } from '../stores/useViewerStore';
import { composeVideoSequence, saveFileDialog, ComposeRequest } from '../lib/ipc';
import styles from './ExportModal.module.css';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { sequence, audioTrack } = useViewerStore();
  const [quality, setQuality] = useState<'high' | 'medium' | 'small'>('high');
  const [format, setFormat] = useState<'mp4' | 'mkv' | 'webm' | 'mov'>('mp4');
  const [isExporting, setIsExporting] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    if (sequence.length === 0) {
      setStatusText('Please add at least one clip to the sequence before exporting.');
      return;
    }

    try {
      const ext = format;
      const defaultFilename = `vexview_export_${Date.now()}.${ext}`;
      const dest = await saveFileDialog(defaultFilename, `${ext.toUpperCase()} Video`, [ext]);

      if (!dest) return;

      setIsExporting(true);
      setStatusText('Encoding sequence with FFmpeg...');

      const clips = sequence.map((c) => ({
        path: c.path,
        start_sec: c.trimStart,
        end_sec: c.trimEnd,
      }));

      const req: ComposeRequest = {
        clips,
        destination: dest,
        quality: quality === 'high' ? 'high' : quality === 'medium' ? 'medium' : 'small',
        audio_track: audioTrack
          ? {
              path: audioTrack.path,
              volume: audioTrack.volume,
              mode: audioTrack.mode,
            }
          : null,
      };

      await composeVideoSequence(req);

      setStatusText(`Successfully exported to ${dest}`);
      setTimeout(() => {
        setIsExporting(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Export failed:', err);
      setStatusText(`Export failed: ${String(err)}`);
      setIsExporting(false);
    }
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Studio Project
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Container Format</span>
            <div className={styles.chipGroup}>
              {(['mp4', 'mkv', 'webm', 'mov'] as const).map((fmt) => (
                <button
                  key={fmt}
                  className={`${styles.chip} ${format === fmt ? styles.active : ''}`}
                  onClick={() => setFormat(fmt)}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Encoding Quality (CRF)</span>
            <div className={styles.chipGroup}>
              <button
                className={`${styles.chip} ${quality === 'high' ? styles.active : ''}`}
                onClick={() => setQuality('high')}
              >
                High (CRF 18)
              </button>
              <button
                className={`${styles.chip} ${quality === 'medium' ? styles.active : ''}`}
                onClick={() => setQuality('medium')}
              >
                Balanced (CRF 22)
              </button>
              <button
                className={`${styles.chip} ${quality === 'small' ? styles.active : ''}`}
                onClick={() => setQuality('small')}
              >
                Fast Web (CRF 28)
              </button>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Sequence Overview</span>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Total Clips: {sequence.length}</span>
              <span>Audio Track: {audioTrack ? audioTrack.fileName : 'Embedded Audio'}</span>
            </div>
          </div>

          {statusText && <div className={styles.statusMessage}>{statusText}</div>}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={isExporting}>
            Cancel
          </button>
          <button
            className={styles.exportBtn}
            onClick={handleExport}
            disabled={isExporting || sequence.length === 0}
          >
            {isExporting ? 'Encoding...' : 'Export Video'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
