import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useViewerStore } from '../stores/useViewerStore';
import { getThumbnailUrl } from '../lib/ipc';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { MediaItem } from '../lib/ipc';
import styles from './Filmstrip.module.css';

interface FilmstripThumbProps {
  item: MediaItem;
  isActive: boolean;
  onClick: () => void;
  itemRef?: React.Ref<HTMLDivElement>;
}

const FilmstripThumb: React.FC<FilmstripThumbProps> = React.memo(({ item, isActive, onClick, itemRef }) => {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const mediaPort = useViewerStore((s) => s.mediaPort);

  const isAudio = item.media_type === 'Audio';
  const isVideo = item.media_type === 'Video';

  const thumbUrl = useMemo(() => {
    if (mediaPort && mediaPort > 0) {
      return getThumbnailUrl(item.path, 110);
    }
    if (!isVideo && !isAudio) {
      return convertFileSrc(item.path);
    }
    return '';
  }, [item.path, mediaPort, isVideo, isAudio]);

  useEffect(() => {
    setHasError(false);
    setLoaded(false);
  }, [thumbUrl]);

  const badgeText = isVideo
    ? 'VID'
    : isAudio
    ? 'AUD'
    : item.media_type === 'Svg'
    ? 'SVG'
    : 'IMG';

  return (
    <div
      ref={itemRef}
      className={`${styles.thumbItem} ${isActive ? styles.active : ''}`}
      onClick={onClick}
      title={`${item.file_name} (${item.media_type})`}
    >
      {!isAudio && !hasError && thumbUrl ? (
        <img
          src={thumbUrl}
          alt={item.file_name}
          className={`${styles.thumbImg} ${loaded ? styles.loaded : ''}`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setHasError(true)}
        />
      ) : isAudio ? (
        <div className={styles.audioPlaceholder}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
      ) : (
        <div className={styles.errorPlaceholder}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
      )}
      <div className={styles.badge}>{badgeText}</div>
    </div>
  );
});

export const Filmstrip: React.FC = () => {
  const { items, currentIndex, selectIndex, showFilmstrip, centerView } = useViewerStore();
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active item on index change
  useEffect(() => {
    if (activeRef.current && showFilmstrip) {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [currentIndex, showFilmstrip]);

  if (items.length <= 1) return null;

  return (
    <footer
      className={`${styles.filmstrip} ${!showFilmstrip ? styles.collapsed : ''}`}
      onTransitionEnd={() => {
        centerView();
      }}
    >
      {items.map((item, idx) => {
        const isActive = idx === currentIndex;
        return (
          <FilmstripThumb
            key={item.path}
            item={item}
            isActive={isActive}
            itemRef={isActive ? activeRef : undefined}
            onClick={() => selectIndex(idx)}
          />
        );
      })}
    </footer>
  );
};

export default Filmstrip;
