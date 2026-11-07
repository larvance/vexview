import React from 'react';
import { useViewerStore } from '../stores/useViewerStore';
import styles from './ClipPropertyInspector.module.css';

const SPEED_PRESETS = [0.5, 1.0, 1.5, 2.0, 4.0];

export const ClipPropertyInspector: React.FC = () => {
  const {
    sequence,
    selectedClipId,
    updateClipProperties,
    splitClipAtPlayhead,
    deleteSelectedClip,
    duplicateSelectedClip,
  } = useViewerStore();

  const selectedClip = selectedClipId ? sequence.find((c) => c.id === selectedClipId) || null : null;

  if (!selectedClip) {
    return (
      <aside className={styles.inspectorPanel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>Inspector</div>
        </div>
        <div className={styles.emptyState}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M10 4v4" />
            <path d="M2 8h20" />
            <path d="M6 4v4" />
          </svg>
          <div>No clip selected.</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            Click on any clip on the timeline or add one from Sources to inspect and adjust its speed, audio dynamics, transforms, and color grading.
          </div>
        </div>
      </aside>
    );
  }

  const isAudioTrack = selectedClip.track.startsWith('a') || selectedClip.mediaType === 'Audio';
  const durationTrimmed = (selectedClip.trimEnd - selectedClip.trimStart) / selectedClip.speed;
  const dbReadout =
    selectedClip.volume === 0
      ? '-inf dB'
      : `${(20 * Math.log10(selectedClip.volume)).toFixed(1)} dB`;

  return (
    <aside className={styles.inspectorPanel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>
          <span className={styles.trackPill}>{selectedClip.track.toUpperCase()}</span>
          <span title={selectedClip.fileName} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>
            {selectedClip.fileName}
          </span>
        </div>
        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
          {durationTrimmed.toFixed(1)}s
        </span>
      </div>

      <div className={styles.scrollArea}>
        {/* 1. Speed Ramping */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>Speed Ramping</span>
            <span className={styles.valBadge}>{selectedClip.speed.toFixed(2)}x</span>
          </div>

          <div className={styles.row}>
            <input
              type="range"
              min="0.25"
              max="4.0"
              step="0.05"
              value={selectedClip.speed}
              onChange={(e) => updateClipProperties(selectedClip.id, { speed: parseFloat(e.target.value) })}
              className={styles.slider}
            />

            <div className={styles.chipRow}>
              {SPEED_PRESETS.map((p) => (
                <button
                  key={p}
                  className={`${styles.chipBtn} ${Math.abs(selectedClip.speed - p) < 0.01 ? styles.active : ''}`}
                  onClick={() => updateClipProperties(selectedClip.id, { speed: p })}
                >
                  {p}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Audio DSP & Sounds */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>Audio & Sound</span>
            <span className={styles.valBadge}>{Math.round(selectedClip.volume * 100)}% ({dbReadout})</span>
          </div>

          <div className={styles.row}>
            <div className={styles.rowHeader}>
              <span>Volume</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '10px' }}>
                <input
                  type="checkbox"
                  checked={selectedClip.mute}
                  onChange={(e) => updateClipProperties(selectedClip.id, { mute: e.target.checked })}
                />
                Mute
              </label>
            </div>
            <input
              type="range"
              min="0"
              max="2.0"
              step="0.05"
              value={selectedClip.mute ? 0 : selectedClip.volume}
              onChange={(e) => updateClipProperties(selectedClip.id, { volume: parseFloat(e.target.value) })}
              className={styles.slider}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.rowHeader}>
              <span>Stereo Pan</span>
              <span className={styles.valBadge}>
                {selectedClip.pan === 0
                  ? 'Center'
                  : selectedClip.pan < 0
                  ? `L ${Math.round(Math.abs(selectedClip.pan) * 100)}%`
                  : `R ${Math.round(selectedClip.pan * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              min="-1.0"
              max="1.0"
              step="0.05"
              value={selectedClip.pan}
              onChange={(e) => updateClipProperties(selectedClip.id, { pan: parseFloat(e.target.value) })}
              className={styles.slider}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.rowHeader}>
              <span>Fade In / Out</span>
              <span className={styles.valBadge}>
                {selectedClip.fadeIn.toFixed(1)}s / {selectedClip.fadeOut.toFixed(1)}s
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="range"
                min="0"
                max="5.0"
                step="0.2"
                value={selectedClip.fadeIn}
                onChange={(e) => updateClipProperties(selectedClip.id, { fadeIn: parseFloat(e.target.value) })}
                className={styles.slider}
                title="Fade In Duration"
              />
              <input
                type="range"
                min="0"
                max="5.0"
                step="0.2"
                value={selectedClip.fadeOut}
                onChange={(e) => updateClipProperties(selectedClip.id, { fadeOut: parseFloat(e.target.value) })}
                className={styles.slider}
                title="Fade Out Duration"
              />
            </div>
          </div>
        </div>

        {/* 3. Video Transform (Only for Video / Image tracks) */}
        {!isAudioTrack && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span>Transform</span>
              <span className={styles.valBadge}>{Math.round(selectedClip.scale * 100)}%</span>
            </div>

            <div className={styles.row}>
              <div className={styles.rowHeader}>
                <span>Scale</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={selectedClip.scale}
                onChange={(e) => updateClipProperties(selectedClip.id, { scale: parseFloat(e.target.value) })}
                className={styles.slider}
              />
            </div>

            <div className={styles.row}>
              <div className={styles.rowHeader}>
                <span>Rotation</span>
                <span className={styles.valBadge}>{selectedClip.rotation}°</span>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                step="5"
                value={selectedClip.rotation}
                onChange={(e) => updateClipProperties(selectedClip.id, { rotation: parseInt(e.target.value, 10) })}
                className={styles.slider}
              />
            </div>

            <div className={styles.btnGrid}>
              <button
                className={`${styles.toolBtn} ${selectedClip.flipH ? styles.active : ''}`}
                onClick={() => updateClipProperties(selectedClip.id, { flipH: !selectedClip.flipH })}
              >
                Flip H
              </button>
              <button
                className={`${styles.toolBtn} ${selectedClip.flipV ? styles.active : ''}`}
                onClick={() => updateClipProperties(selectedClip.id, { flipV: !selectedClip.flipV })}
              >
                Flip V
              </button>
            </div>

            <div className={styles.row}>
              <div className={styles.rowHeader}>
                <span>Opacity</span>
                <span className={styles.valBadge}>{Math.round(selectedClip.opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.0"
                step="0.05"
                value={selectedClip.opacity}
                onChange={(e) => updateClipProperties(selectedClip.id, { opacity: parseFloat(e.target.value) })}
                className={styles.slider}
              />
            </div>
          </div>
        )}

        {/* 4. Color & Grade (Only for Video / Image tracks) */}
        {!isAudioTrack && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span>Color & Grade</span>
            </div>

            <div className={styles.row}>
              <div className={styles.rowHeader}>
                <span>Brightness</span>
                <span className={styles.valBadge}>{selectedClip.brightness > 0 ? `+${selectedClip.brightness}` : selectedClip.brightness}%</span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                step="2"
                value={selectedClip.brightness}
                onChange={(e) => updateClipProperties(selectedClip.id, { brightness: parseInt(e.target.value, 10) })}
                className={styles.slider}
              />
            </div>

            <div className={styles.row}>
              <div className={styles.rowHeader}>
                <span>Contrast</span>
                <span className={styles.valBadge}>{Math.round(selectedClip.contrast * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="2.0"
                step="0.05"
                value={selectedClip.contrast}
                onChange={(e) => updateClipProperties(selectedClip.id, { contrast: parseFloat(e.target.value) })}
                className={styles.slider}
              />
            </div>

            <div className={styles.row}>
              <div className={styles.rowHeader}>
                <span>Saturation</span>
                <span className={styles.valBadge}>{Math.round(selectedClip.saturation * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="2.0"
                step="0.05"
                value={selectedClip.saturation}
                onChange={(e) => updateClipProperties(selectedClip.id, { saturation: parseFloat(e.target.value) })}
                className={styles.slider}
              />
            </div>
          </div>
        )}

        {/* 5. Clip Actions */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span>Clip Actions</span>
          </div>

          <div className={styles.btnGrid}>
            <button
              className={styles.toolBtn}
              onClick={() => splitClipAtPlayhead(selectedClip.id)}
              title="Split clip at playhead position (S)"
            >
              Split (S)
            </button>
            <button
              className={styles.toolBtn}
              onClick={duplicateSelectedClip}
              title="Duplicate selected clip"
            >
              Duplicate
            </button>
          </div>

          <button
            className={`${styles.toolBtn} ${styles.deleteBtn}`}
            onClick={deleteSelectedClip}
            title="Delete clip from timeline (Delete)"
          >
            Delete Clip (Del)
          </button>
        </div>
      </div>
    </aside>
  );
};

export default ClipPropertyInspector;
