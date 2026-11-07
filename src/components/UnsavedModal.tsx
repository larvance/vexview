import React from 'react';
import { useViewerStore } from '../stores/useViewerStore';
import styles from './ExportModal.module.css';

export const UnsavedModal: React.FC = () => {
  const { promptSaveBeforeExit, setPromptSaveBeforeExit, exitStudioMode, saveProject } = useViewerStore();

  if (!promptSaveBeforeExit) return null;

  const handleSaveAndExit = async () => {
    const saved = await saveProject();
    if (saved) {
      exitStudioMode();
    }
  };

  const handleDiscardAndExit = () => {
    exitStudioMode();
  };

  const handleCancel = () => {
    setPromptSaveBeforeExit(false);
  };

  return (
    <div className={styles.modalOverlay} onClick={handleCancel}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Save Changes?
          </div>
          <button className={styles.closeBtn} onClick={handleCancel}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #c5c2b8)', lineHeight: 1.6 }}>
            You have unsaved changes in your timeline project. Would you like to save your work to a <strong>.vexedit</strong> project file before returning to the viewer?
          </p>
        </div>

        <div className={styles.modalFooter} style={{ justifyContent: 'space-between', gap: '8px' }}>
          <button
            className={styles.cancelBtn}
            onClick={handleDiscardAndExit}
            style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
          >
            Discard Changes
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className={styles.cancelBtn} onClick={handleCancel}>
              Cancel
            </button>
            <button className={styles.submitBtn} onClick={handleSaveAndExit}>
              Save Project (.vexedit)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnsavedModal;
