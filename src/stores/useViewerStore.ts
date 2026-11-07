import { create } from 'zustand';
import {
  MediaItem,
  ImageDetailResponse,
  VideoMetadata,
  AudioMetadata,
  AnnotationItem,
  scanFolder,
  loadImageDetail,
  probeVideo,
  probeAudio,
  openFileDialog,
  openFolderDialog,
  copyImageToClipboard,
  scanFiles,
  getMediaServerPort,
  toggleFullscreenWindow,
} from '../lib/ipc';
import { audioEngine } from '../lib/audioEngine';
import { renderCompositeEndImage } from '../lib/imageComposite';

export type ActiveSubTool =
  | 'select'
  | 'select_lasso'
  | 'select_polygon'
  | 'crop'
  | 'pen'
  | 'highlighter'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'rect_fill'
  | 'ellipse'
  | 'ellipse_fill'
  | 'text'
  | 'blur_rect'
  | 'mosaic_rect'
  | 'blur_heavy'
  | 'eraser'
  | 'eyedropper';

export interface ActiveSelection {
  type: 'rect' | 'lasso' | 'polygon';
  points: { x: number; y: number }[];
  box: { x: number; y: number; width: number; height: number };
}

export type CropAspectRatio = 'free' | '1:1' | '16:9' | '9:16' | '4:3' | '3:2' | '21:9';

export interface EditorState {
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  crop: { x: number; y: number; width: number; height: number } | null;
  brightness: number;
  contrast: number;
  blur: number;
  saturation: number;
  warmth: number;
  filter: 'none' | 'grayscale' | 'invert' | 'sepia';
  quality: number;
  exportFormat: 'same' | 'png' | 'jpg' | 'webp' | 'bmp' | 'tiff';
  exportScale: number;
  customWidth: number | null;
  customHeight: number | null;
  overwrite: boolean;
  splitPosition: number;
  previewUrl: string | null;
}

export interface VideoStudioParams {
  speed: number;
  crop: { x: number; y: number; width: number; height: number } | null;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  muteAudio: boolean;
  volume: number;
  brightness: number;
  contrast: number;
  saturation: number;
  gamma: number;
  grayscale: boolean;
  sepia: boolean;
  invert: boolean;
  reverse: boolean;
  timecodeBurnIn: boolean;
  telemetryText: string;
}

export type TrackType = 'v1' | 'v2' | 'a1' | 'a2';

export interface SequenceClip {
  id: string;
  path: string;
  fileName: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  timelineStart: number;
  track: TrackType;
  mediaType: 'Image' | 'Video' | 'Audio';
  speed: number;
  volume: number;
  pan: number;
  mute: boolean;
  fadeIn: number;
  fadeOut: number;
  scale: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  opacity: number;
  brightness: number;
  contrast: number;
  saturation: number;
}

export const createDefaultClip = (
  path: string,
  fileName: string,
  duration: number,
  track: TrackType = 'v1',
  mediaType: 'Image' | 'Video' | 'Audio' = 'Video',
  timelineStart: number = 0,
): SequenceClip => ({
  id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  path,
  fileName,
  duration: duration > 0 ? duration : 3.0,
  trimStart: 0,
  trimEnd: duration > 0 ? duration : 3.0,
  timelineStart,
  track,
  mediaType,
  speed: 1.0,
  volume: 1.0,
  pan: 0,
  mute: false,
  fadeIn: 0,
  fadeOut: 0,
  scale: 1.0,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1.0,
  brightness: 0,
  contrast: 1.0,
  saturation: 1.0,
});

export interface AudioTrackConfig {
  path: string;
  fileName: string;
  volume: number;
  mode: 'mix' | 'replace';
}

interface ViewerStore {
  folderPath: string;
  items: MediaItem[];
  currentIndex: number;
  imageDetail: ImageDetailResponse | null;
  videoDetail: VideoMetadata | null;
  audioDetail: AudioMetadata | null;
  loading: boolean;
  error: string | null;

  // Viewport & Zoom Basis
  zoom: number;
  fitScale: number;
  pan: { x: number; y: number };
  activeMode: 'view' | 'edit';
  showFilmstrip: boolean;
  showInspector: boolean;
  isSlideshowActive: boolean;

  // Video playback & trim
  isPlaying: boolean;
  isLooping: boolean;
  currentTime: number;
  duration: number;
  seekTime: number | null;
  trimRange: [number, number];

  // Image editing (parametric)
  editor: EditorState;

  // Annotations & Tools
  activeSubTool: ActiveSubTool;
  activeSelection: ActiveSelection | null;
  strokeColor: [number, number, number, number];
  fillColor: [number, number, number, number] | null;
  strokeWidth: number;
  fontSize: number;
  badgeNumber: number;
  annotations: AnnotationItem[];
  annotationHistory: AnnotationItem[][];
  annotationRedoHistory: AnnotationItem[][];

  // Crop & Straighten
  cropBox: { x: number; y: number; width: number; height: number } | null;
  cropAspectRatio: CropAspectRatio;
  straightenAngle: number;

  // Video Studio Parameters
  videoParams: VideoStudioParams;

  // Sequence Storyboard, Multi-track & Audio Track
  sequence: SequenceClip[];
  selectedClipId: string | null;
  audioTrack: AudioTrackConfig | null;

  // Actions
  loadFolder: (path: string) => Promise<void>;
  selectIndex: (index: number, autoPlay?: boolean) => Promise<void>;
  nextItem: () => Promise<void>;
  prevItem: () => Promise<void>;
  setZoom: (zoom: number) => void;
  setFitScale: (scale: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setZoomAndPan: (zoom: number, pan: { x: number; y: number }) => void;
  resetView: () => void;
  centerView: () => void;
  setCenterViewAction: (fn: (() => void) | null) => void;
  centerViewAction: (() => void) | null;
  setActiveMode: (mode: 'view' | 'edit') => void;
  enterStudioMode: () => void;
  exitStudioMode: () => void;
  toggleFilmstrip: () => void;
  toggleInspector: () => void;
  setSlideshow: (active: boolean) => void;
  toggleSlideshow: () => void;
  isFullscreen: boolean;
  setIsFullscreen: (fullscreen: boolean) => void;
  toggleFullscreen: () => Promise<void>;
  setIsPlaying: (playing: boolean) => void;
  setIsLooping: (looping: boolean) => void;
  toggleLoop: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  mediaPort: number | null;
  initMediaPort: () => Promise<void>;
  seekTo: (time: number) => void;
  setTrimRange: (range: [number, number]) => void;
  updateEditor: (partial: Partial<EditorState>) => void;
  resetEditor: () => void;
  stopAllPlayback: () => void;
  openMediaFile: () => Promise<void>;
  openTargetFile: (filePath: string, autoPlay?: boolean) => Promise<void>;
  openTargetFiles: (filePaths: string[], autoPlay?: boolean) => Promise<void>;
  openMediaFolder: () => Promise<void>;
  copyNotice: boolean;
  copyCurrentToClipboard: () => Promise<void>;

  // Annotation Actions
  setActiveSubTool: (tool: ActiveSubTool) => void;
  setActiveSelection: (selection: ActiveSelection | null) => void;
  applyBlurToSelection: (blurType?: 'blur_rect' | 'mosaic_rect' | 'blur_heavy') => void;
  setStrokeColor: (color: [number, number, number, number]) => void;
  setFillColor: (color: [number, number, number, number] | null) => void;
  setStrokeWidth: (width: number) => void;
  setFontSize: (size: number) => void;
  setBadgeNumber: (num: number) => void;
  incrementBadgeNumber: () => void;
  addAnnotation: (item: AnnotationItem) => void;
  undoAnnotation: () => void;
  redoAnnotation: () => void;
  clearAnnotations: () => void;
  setAnnotations: (items: AnnotationItem[]) => void;

  // Crop Actions
  setCropBox: (box: { x: number; y: number; width: number; height: number } | null) => void;
  setCropAspectRatio: (ratio: CropAspectRatio) => void;
  setStraightenAngle: (angle: number) => void;

  // Video Studio Actions
  updateVideoParams: (partial: Partial<VideoStudioParams>) => void;
  resetVideoParams: () => void;

  // Sequence & Multi-Track Studio Actions
  setSelectedClipId: (id: string | null) => void;
  addCurrentToSequence: (track?: TrackType) => void;
  addClipToTrack: (filePath: string, track: TrackType) => Promise<void>;
  removeClipFromSequence: (id: string) => void;
  moveClipInSequence: (fromIndex: number, toIndex: number) => void;
  updateClipDuration: (id: string, duration: number) => void;
  updateClipTrim: (id: string, trimStart: number, trimEnd: number) => void;
  updateClipTrimRange: (id: string, trimStart: number, trimEnd: number) => void;
  updateClipProperties: (id: string, partial: Partial<SequenceClip>) => void;
  splitClipAtPlayhead: (clipId?: string) => void;
  deleteSelectedClip: () => void;
  duplicateSelectedClip: () => void;
  moveClipOnTimeline: (id: string, timelineStart: number, track?: TrackType) => void;
  clearSequence: () => void;
  setAudioTrack: (track: AudioTrackConfig | null) => void;
  updateAudioVolume: (volume: number) => void;
  setAudioMode: (mode: 'mix' | 'replace') => void;
  newTimelineProject: (mode?: 'video' | 'audio') => void;
  importFilesToSequence: (filePaths: string[], track?: TrackType) => Promise<void>;
}

const initialEditorState: EditorState = {
  rotation: 0,
  flipH: false,
  flipV: false,
  crop: null,
  brightness: 0,
  contrast: 0,
  blur: 0,
  saturation: 0,
  warmth: 0,
  filter: 'none',
  quality: 90,
  exportFormat: 'same',
  exportScale: 1.0,
  customWidth: null,
  customHeight: null,
  overwrite: false,
  splitPosition: 50,
  previewUrl: null,
};

const initialVideoParams: VideoStudioParams = {
  speed: 1.0,
  crop: null,
  rotation: 0,
  flipH: false,
  flipV: false,
  muteAudio: false,
  volume: 1.0,
  brightness: 0.0,
  contrast: 1.0,
  saturation: 1.0,
  gamma: 1.0,
  grayscale: false,
  sepia: false,
  invert: false,
  reverse: false,
  timecodeBurnIn: false,
  telemetryText: '',
};

export const useViewerStore = create<ViewerStore>((set, get) => ({
  folderPath: '',
  items: [],
  currentIndex: 0,
  imageDetail: null,
  videoDetail: null,
  audioDetail: null,
  loading: false,
  error: null,

  zoom: 1.0,
  fitScale: 1.0,
  pan: { x: 0, y: 0 },
  activeMode: 'view',
  showFilmstrip: true,
  showInspector: false,
  isSlideshowActive: false,

  isPlaying: false,
  isLooping: true,
  currentTime: 0,
  duration: 0,
  seekTime: null,
  trimRange: [0, 0],
  mediaPort: null,
  initMediaPort: async () => {
    const port = await getMediaServerPort();
    if (port > 0) {
      set({ mediaPort: port });
    }
  },

  editor: initialEditorState,

  activeSubTool: 'select',
  activeSelection: null,
  strokeColor: [239, 68, 68, 255], // default red
  fillColor: null,
  strokeWidth: 4,
  fontSize: 18,
  badgeNumber: 1,
  annotations: [],
  annotationHistory: [],
  annotationRedoHistory: [],

  cropBox: null,
  cropAspectRatio: 'free',
  straightenAngle: 0,

  videoParams: initialVideoParams,

  sequence: [],
  selectedClipId: null,
  audioTrack: null,
  centerViewAction: null,

  loadFolder: async (path: string) => {
    set({ loading: true, error: null, folderPath: path });
    try {
      const items = await scanFolder(path);
      set({ items, currentIndex: 0, loading: false });
      if (items.length > 0) {
        await get().selectIndex(0);
      }
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  selectIndex: async (index: number, autoPlay: boolean = false) => {
    const { items } = get();
    if (index < 0 || index >= items.length) return;

    // Stop any existing audio playback before switching
    audioEngine.stopPlayback();

    const current = items[index];
    set({
      currentIndex: index,
      loading: true,
      error: null,
      zoom: 1.0,
      pan: { x: 0, y: 0 },
      editor: initialEditorState,
      isPlaying: false,
      currentTime: 0,
      seekTime: null,
      annotations: [],
      annotationHistory: [],
      annotationRedoHistory: [],
      cropBox: null,
      straightenAngle: 0,
      videoParams: initialVideoParams,
    });

    try {
      if (current.media_type === 'Video') {
        const videoDetail = await probeVideo(current.path);
        const currentIsPlaying = get().isPlaying;
        set({
          videoDetail,
          imageDetail: null,
          audioDetail: null,
          duration: videoDetail.duration_seconds,
          trimRange: [0, videoDetail.duration_seconds],
          loading: false,
          isPlaying: currentIsPlaying || autoPlay,
        });
      } else if (current.media_type === 'Audio') {
        const audioRes = await audioEngine.loadFile(current.path, autoPlay);
        const durationSecs = audioEngine.getDuration() || audioRes.duration_seconds;
        const audioDetail: AudioMetadata = {
          duration_seconds: durationSecs,
          sample_rate: audioRes.sample_rate,
          channels: audioRes.channels,
          audio_codec: audioRes.audio_codec,
          title: audioRes.title,
          artist: audioRes.artist,
          file_size: audioRes.file_size,
        };
        set({
          audioDetail,
          videoDetail: null,
          imageDetail: null,
          duration: durationSecs,
          trimRange: [0, durationSecs],
          loading: false,
        });
      } else {
        const imageDetail = await loadImageDetail(current.path);
        set({
          imageDetail,
          videoDetail: null,
          audioDetail: null,
          loading: false,
        });
      }
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  nextItem: async () => {
    const { items, currentIndex, isPlaying } = get();
    if (items.length === 0) return;
    const next = (currentIndex + 1) % items.length;
    await get().selectIndex(next, isPlaying);
  },

  prevItem: async () => {
    const { items, currentIndex, isPlaying } = get();
    if (items.length === 0) return;
    const prev = (currentIndex - 1 + items.length) % items.length;
    await get().selectIndex(prev, isPlaying);
  },

  setZoom: (zoom) => {
    const minZ = get().fitScale || 0.1;
    set({ zoom: Math.max(minZ, Math.min(zoom, minZ * 32.0)) });
  },
  setFitScale: (fitScale) => set({ fitScale: Math.max(0.001, fitScale) }),
  setPan: (pan) => set({ pan }),
  setZoomAndPan: (zoom, pan) => {
    const minZ = get().fitScale || 0.05;
    set({ zoom: Math.max(minZ, Math.min(zoom, minZ * 32.0)), pan });
  },
  setCenterViewAction: (centerViewAction) => set({ centerViewAction }),
  centerView: () => {
    const fn = get().centerViewAction;
    if (fn) {
      fn();
    } else {
      const fit = get().fitScale || 1.0;
      set({ zoom: fit, pan: { x: 0, y: 0 } });
    }
  },
  resetView: () => {
    const fn = get().centerViewAction;
    if (fn) {
      fn();
    } else {
      const fit = get().fitScale || 1.0;
      set({ zoom: fit, pan: { x: 0, y: 0 } });
    }
  },

  setActiveMode: (activeMode) => {
    if (activeMode === 'edit') {
      get().enterStudioMode();
    } else {
      get().exitStudioMode();
    }
  },
  enterStudioMode: () => {
    const { isPlaying, items, currentIndex, sequence, duration } = get();
    if (isPlaying) {
      get().setIsPlaying(false);
    }
    const current = items[currentIndex];
    let nextSeq = [...sequence];
    let selectedId = get().selectedClipId;

    if (nextSeq.length === 0 && current) {
      const isAud = current.media_type === 'Audio';
      const isVid = current.media_type === 'Video';
      const dur = duration > 0 ? duration : isVid || isAud ? 5.0 : 3.0;
      const clip = createDefaultClip(
        current.path,
        current.file_name,
        dur,
        isAud ? 'a1' : 'v1',
        isAud ? 'Audio' : isVid ? 'Video' : 'Image',
        0,
      );
      nextSeq = [clip];
      selectedId = clip.id;
    } else if (!selectedId && nextSeq.length > 0) {
      selectedId = nextSeq[0].id;
    }

    set({
      activeMode: 'edit',
      showFilmstrip: false,
      showInspector: false,
      sequence: nextSeq,
      selectedClipId: selectedId,
    });
  },
  exitStudioMode: () => {
    set({
      activeMode: 'view',
      showFilmstrip: true,
    });
  },
  toggleFilmstrip: () => set((s) => ({ showFilmstrip: !s.showFilmstrip })),
  toggleInspector: () => set((s) => ({ showInspector: !s.showInspector })),
  setSlideshow: (isSlideshowActive) => set({ isSlideshowActive }),
  toggleSlideshow: () => set((s) => ({ isSlideshowActive: !s.isSlideshowActive })),

  isFullscreen: false,
  setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
  toggleFullscreen: async () => {
    const next = await toggleFullscreenWindow();
    set({ isFullscreen: next });
    setTimeout(() => {
      get().centerView();
    }, 50);
  },

  stopAllPlayback: () => {
    audioEngine.stopPlayback();
    if (typeof document !== 'undefined') {
      document.querySelectorAll('video, audio').forEach((media) => {
        try {
          (media as HTMLMediaElement).pause();
          (media as HTMLMediaElement).currentTime = 0;
        } catch (_) {}
      });
    }
    set({ isPlaying: false, isSlideshowActive: false });
  },

  setIsPlaying: (isPlaying) => {
    const { items, currentIndex } = get();
    const current = items[currentIndex];
    if (current?.media_type === 'Audio') {
      if (isPlaying) {
        audioEngine.play().catch(() => {});
      } else {
        audioEngine.pause();
      }
    }
    set({ isPlaying });
  },
  setIsLooping: (isLooping) => set({ isLooping }),
  toggleLoop: () => set((state) => ({ isLooping: !state.isLooping })),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  seekTo: (seekTime) => {
    const { items, currentIndex } = get();
    const current = items[currentIndex];
    if (current?.media_type === 'Audio') {
      audioEngine.seek(seekTime);
    }
    set({ seekTime, currentTime: seekTime });
  },
  setTrimRange: (trimRange) => set({ trimRange }),

  updateEditor: (partial) =>
    set((s) => ({ editor: { ...s.editor, ...partial } })),
  resetEditor: () => set({ editor: initialEditorState }),

  copyNotice: false,
  copyCurrentToClipboard: async () => {
    const { items, currentIndex, activeMode, editor, annotations } = get();
    const current = items[currentIndex];
    if (!current || current.media_type === 'Video' || current.media_type === 'Audio') return;
    try {
      const hasEdits =
        activeMode === 'edit' ||
        editor.rotation !== 0 ||
        editor.flipH ||
        editor.flipV ||
        editor.crop !== null ||
        editor.brightness !== 0 ||
        editor.contrast !== 0 ||
        editor.blur > 0 ||
        editor.saturation !== 0 ||
        editor.warmth !== 0 ||
        editor.filter !== 'none' ||
        annotations.length > 0;

      if (hasEdits) {
        let dataUrl: string | undefined;
        try {
          dataUrl = await renderCompositeEndImage();
        } catch (renderErr) {
          console.warn('Failed to render frontend composite, falling back to original:', renderErr);
        }
        await copyImageToClipboard(dataUrl ? undefined : current.path, dataUrl);
      } else {
        await copyImageToClipboard(current.path, undefined);
      }

      set({ copyNotice: true });
      setTimeout(() => {
        set({ copyNotice: false });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  },

  // Annotation Actions
  setActiveSubTool: (activeSubTool) => set({ activeSubTool }),
  setActiveSelection: (activeSelection) => set({ activeSelection }),
  applyBlurToSelection: (blurType = 'blur_rect') => {
    const { activeSelection, addAnnotation, setActiveSelection } = get();
    if (!activeSelection) return;
    const { box, points, type } = activeSelection;
    if (box.width <= 0 || box.height <= 0) return;

    const polyPts = type !== 'rect' && points.length >= 3 ? points : undefined;
    if (blurType === 'mosaic_rect') {
      addAnnotation({
        type: 'MosaicRect',
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        block_size: 14,
        polygon_points: polyPts,
      });
    } else if (blurType === 'blur_heavy') {
      addAnnotation({
        type: 'BlurRect',
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        sigma: 28.0,
        polygon_points: polyPts,
      });
    } else {
      addAnnotation({
        type: 'BlurRect',
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        sigma: 12.0,
        polygon_points: polyPts,
      });
    }
    setActiveSelection(null);
  },
  setStrokeColor: (strokeColor) => set({ strokeColor }),
  setFillColor: (fillColor) => set({ fillColor }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth: Math.max(1, strokeWidth) }),
  setFontSize: (fontSize) => set({ fontSize: Math.max(8, fontSize) }),
  setBadgeNumber: (badgeNumber) => set({ badgeNumber }),
  incrementBadgeNumber: () => set((s) => ({ badgeNumber: s.badgeNumber + 1 })),

  addAnnotation: (item) =>
    set((s) => ({
      annotationHistory: [...s.annotationHistory, s.annotations],
      annotationRedoHistory: [],
      annotations: [...s.annotations, item],
    })),

  undoAnnotation: () =>
    set((s) => {
      if (s.annotationHistory.length === 0) return s;
      const prev = s.annotationHistory[s.annotationHistory.length - 1];
      const newHistory = s.annotationHistory.slice(0, -1);
      return {
        annotations: prev,
        annotationHistory: newHistory,
        annotationRedoHistory: [...s.annotationRedoHistory, s.annotations],
      };
    }),

  redoAnnotation: () =>
    set((s) => {
      if (s.annotationRedoHistory.length === 0) return s;
      const next = s.annotationRedoHistory[s.annotationRedoHistory.length - 1];
      const newRedo = s.annotationRedoHistory.slice(0, -1);
      return {
        annotations: next,
        annotationHistory: [...s.annotationHistory, s.annotations],
        annotationRedoHistory: newRedo,
      };
    }),

  clearAnnotations: () =>
    set((s) => ({
      annotationHistory: [...s.annotationHistory, s.annotations],
      annotationRedoHistory: [],
      annotations: [],
    })),

  setAnnotations: (annotations) => set({ annotations }),

  // Crop Actions
  setCropBox: (cropBox) => set({ cropBox }),
  setCropAspectRatio: (cropAspectRatio) => set({ cropAspectRatio }),
  setStraightenAngle: (straightenAngle) => set({ straightenAngle }),

  // Video Studio Actions
  updateVideoParams: (partial) =>
    set((s) => ({ videoParams: { ...s.videoParams, ...partial } })),
  resetVideoParams: () => set({ videoParams: initialVideoParams }),

  openTargetFile: async (filePath: string, autoPlay: boolean = true) => {
    try {
      const cleanPath = filePath.replace(/^file:\/\//, '');
      const parentDir = cleanPath.substring(0, cleanPath.lastIndexOf('/')) || '.';
      const fileName = cleanPath.split('/').pop() || 'media';
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const isVid = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv'].includes(ext);
      const isAud = [
        'mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'm4a', 'opus', 'wma', 'aiff', 'aif', 'mid', 'midi', 'ac3', 'dts', 'alac', 'amr'
      ].includes(ext);
      const isSvg = ext === 'svg' || ext === 'svgz';
      const initialItem: MediaItem = {
        path: cleanPath,
        file_name: fileName,
        media_type: isVid ? 'Video' : isAud ? 'Audio' : isSvg ? 'Svg' : 'Image',
        file_size: 0,
      };

      // Immediately display clicked target file in 0ms without blocking on directory scan
      set({
        folderPath: parentDir,
        items: [initialItem],
        currentIndex: 0,
        loading: false,
        error: null,
      });

      const selectPromise = get().selectIndex(0, autoPlay);

      // Asynchronously scan parent directory in the background to populate filmstrip and next/prev list
      scanFolder(parentDir)
        .then((scanned) => {
          if (!scanned || scanned.length === 0) return;
          let targetIdx = scanned.findIndex(
            (it) => it.path === cleanPath || it.path === filePath
          );
          let finalItems = scanned;
          if (targetIdx === -1) {
            finalItems = [initialItem, ...scanned];
            targetIdx = 0;
          }
          const current = get();
          if (current.folderPath === parentDir) {
            set({ items: finalItems, currentIndex: targetIdx });
          }
        })
        .catch(() => {});

      await selectPromise;
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  openTargetFiles: async (filePaths: string[], autoPlay: boolean = true) => {
    if (!filePaths || filePaths.length === 0) return;
    if (filePaths.length === 1) {
      return get().openTargetFile(filePaths[0], autoPlay);
    }

    try {
      audioEngine.stopPlayback();

      const initialItems: MediaItem[] = filePaths.map((fp) => {
        const cleanPath = fp.replace(/^file:\/\//, '');
        const fileName = cleanPath.split('/').pop() || 'media';
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const isVid = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv'].includes(ext);
        const isAud = [
          'mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'm4a', 'opus', 'wma', 'aiff', 'aif', 'mid', 'midi', 'ac3', 'dts', 'alac', 'amr'
        ].includes(ext);
        const isSvg = ext === 'svg' || ext === 'svgz';
        return {
          path: cleanPath,
          file_name: fileName,
          media_type: isVid ? 'Video' : isAud ? 'Audio' : isSvg ? 'Svg' : 'Image',
          file_size: 0,
        };
      });

      const firstClean = filePaths[0].replace(/^file:\/\//, '');
      const parentDir = firstClean.substring(0, firstClean.lastIndexOf('/')) || '.';

      set({
        folderPath: parentDir,
        items: initialItems,
        currentIndex: 0,
        loading: false,
        error: null,
      });

      const selectPromise = get().selectIndex(0, autoPlay);

      scanFiles(filePaths)
        .then((scanned) => {
          if (scanned && scanned.length > 0) {
            const current = get();
            if (current.items.length === filePaths.length) {
              set({ items: scanned });
            }
          }
        })
        .catch(() => {});

      await selectPromise;
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  openMediaFile: async () => {
    try {
      const selectedPaths = await openFileDialog();
      if (!selectedPaths || selectedPaths.length === 0) return;
      await get().openTargetFiles(selectedPaths, true);
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  openMediaFolder: async () => {
    try {
      const selectedDir = await openFolderDialog();
      if (!selectedDir) return;
      await get().loadFolder(selectedDir);
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  setSelectedClipId: (selectedClipId) => set({ selectedClipId }),

  addCurrentToSequence: (track: TrackType = 'v1') => {
    const { items, currentIndex, duration, trimRange, sequence } = get();
    const current = items[currentIndex];
    if (!current) return;
    const isVid = current.media_type === 'Video';
    const isAud = current.media_type === 'Audio';
    const defDuration = isVid || isAud ? duration || 5.0 : 3.0;

    const trackClips = sequence.filter((c) => c.track === track);
    let nextStart = 0;
    for (const c of trackClips) {
      const span = (c.trimEnd - c.trimStart) / c.speed;
      const end = c.timelineStart + span;
      if (end > nextStart) nextStart = end;
    }

    const newClip = createDefaultClip(
      current.path,
      current.file_name,
      defDuration,
      track,
      isVid ? 'Video' : isAud ? 'Audio' : 'Image',
      nextStart,
    );
    if ((isVid || isAud) && trimRange[1] > 0) {
      newClip.trimStart = trimRange[0];
      newClip.trimEnd = trimRange[1];
    }

    set((s) => ({
      sequence: [...s.sequence, newClip],
      selectedClipId: newClip.id,
    }));
  },

  addClipToTrack: async (filePath: string, track: TrackType) => {
    const clean = filePath.replace(/^file:\/\//, '');
    const fileName = clean.split('/').pop() || 'media';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const isVid = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv'].includes(ext);
    const isAud = [
      'mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'm4a', 'opus', 'wma', 'aiff', 'aif', 'mid', 'midi', 'ac3', 'dts', 'alac', 'amr'
    ].includes(ext);

    let dur = 3.0;
    let mType: 'Image' | 'Video' | 'Audio' = 'Image';
    if (isVid) {
      mType = 'Video';
      try {
        const meta = await probeVideo(clean);
        dur = meta.duration_seconds || 5.0;
      } catch {}
    } else if (isAud) {
      mType = 'Audio';
      try {
        const meta = await probeAudio(clean);
        dur = meta.duration_seconds || 15.0;
      } catch {}
    }

    const { sequence } = get();
    const trackClips = sequence.filter((c) => c.track === track);
    let nextStart = 0;
    for (const c of trackClips) {
      const span = (c.trimEnd - c.trimStart) / c.speed;
      const end = c.timelineStart + span;
      if (end > nextStart) nextStart = end;
    }

    const newClip = createDefaultClip(clean, fileName, dur, track, mType, nextStart);
    set({
      sequence: [...sequence, newClip],
      selectedClipId: newClip.id,
    });
  },

  removeClipFromSequence: (id) =>
    set((s) => {
      const nextSeq = s.sequence.filter((c) => c.id !== id);
      const nextSelected = s.selectedClipId === id ? (nextSeq.length > 0 ? nextSeq[0].id : null) : s.selectedClipId;
      return { sequence: nextSeq, selectedClipId: nextSelected };
    }),

  moveClipInSequence: (fromIndex, toIndex) =>
    set((s) => {
      if (fromIndex < 0 || fromIndex >= s.sequence.length) return s;
      if (toIndex < 0 || toIndex >= s.sequence.length) return s;
      const nextSeq = [...s.sequence];
      const [moved] = nextSeq.splice(fromIndex, 1);
      nextSeq.splice(toIndex, 0, moved);
      return { sequence: nextSeq };
    }),

  updateClipDuration: (id, duration) =>
    set((s) => ({
      sequence: s.sequence.map((c) => (c.id === id ? { ...c, duration, trimEnd: duration } : c)),
    })),

  updateClipTrim: (id, trimStart, trimEnd) =>
    set((s) => ({
      sequence: s.sequence.map((c) => (c.id === id ? { ...c, trimStart, trimEnd } : c)),
    })),

  updateClipTrimRange: (id, trimStart, trimEnd) =>
    set((s) => ({
      sequence: s.sequence.map((c) => {
        if (c.id !== id) return c;
        const validStart = Math.max(0, Math.min(trimStart, c.duration - 0.05));
        const validEnd = Math.max(validStart + 0.05, Math.min(trimEnd, c.duration));
        return { ...c, trimStart: validStart, trimEnd: validEnd };
      }),
    })),

  updateClipProperties: (id, partial) =>
    set((s) => ({
      sequence: s.sequence.map((c) => (c.id === id ? { ...c, ...partial } : c)),
    })),

  splitClipAtPlayhead: (clipId?: string) => {
    const { sequence, currentTime, selectedClipId } = get();
    const targetId = clipId || selectedClipId;
    const clip = targetId
      ? sequence.find((c) => c.id === targetId)
      : sequence.find((c) => {
          const span = (c.trimEnd - c.trimStart) / c.speed;
          return currentTime > c.timelineStart + 0.05 && currentTime < c.timelineStart + span - 0.05;
        });

    if (!clip) return;
    const clipSpan = (clip.trimEnd - clip.trimStart) / clip.speed;
    if (currentTime <= clip.timelineStart + 0.05 || currentTime >= clip.timelineStart + clipSpan - 0.05) {
      return;
    }

    const offsetInTimeline = currentTime - clip.timelineStart;
    const splitSourceTime = clip.trimStart + offsetInTimeline * clip.speed;

    const firstClip: SequenceClip = {
      ...clip,
      trimEnd: splitSourceTime,
    };

    const secondClip: SequenceClip = {
      ...clip,
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timelineStart: currentTime,
      trimStart: splitSourceTime,
    };

    const nextSeq = sequence.map((c) => (c.id === clip.id ? firstClip : c));
    nextSeq.push(secondClip);

    set({
      sequence: nextSeq,
      selectedClipId: secondClip.id,
    });
  },

  deleteSelectedClip: () => {
    const { sequence, selectedClipId } = get();
    if (!selectedClipId) return;
    const next = sequence.filter((c) => c.id !== selectedClipId);
    set({
      sequence: next,
      selectedClipId: next.length > 0 ? next[0].id : null,
    });
  },

  duplicateSelectedClip: () => {
    const { sequence, selectedClipId } = get();
    if (!selectedClipId) return;
    const clip = sequence.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const span = (clip.trimEnd - clip.trimStart) / clip.speed;
    const dup: SequenceClip = {
      ...clip,
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timelineStart: clip.timelineStart + span + 0.1,
    };
    set({
      sequence: [...sequence, dup],
      selectedClipId: dup.id,
    });
  },

  moveClipOnTimeline: (id, timelineStart, track) =>
    set((s) => ({
      sequence: s.sequence.map((c) => {
        if (c.id !== id) return c;
        return {
          ...c,
          timelineStart: Math.max(0, timelineStart),
          track: track || c.track,
        };
      }),
    })),

  newTimelineProject: (_mode?: 'video' | 'audio') => {
    set({
      sequence: [],
      selectedClipId: null,
      audioTrack: null,
      activeMode: 'edit',
      zoom: 1.0,
      pan: { x: 0, y: 0 },
    });
  },

  importFilesToSequence: async (filePaths: string[], track: TrackType = 'v1') => {
    const newClips: SequenceClip[] = [];
    const { sequence } = get();
    let currentTrackEnd = 0;
    const existingTrackClips = sequence.filter((c) => c.track === track);
    for (const c of existingTrackClips) {
      const span = (c.trimEnd - c.trimStart) / c.speed;
      const end = c.timelineStart + span;
      if (end > currentTrackEnd) currentTrackEnd = end;
    }

    for (const fp of filePaths) {
      const clean = fp.replace(/^file:\/\//, '');
      const fileName = clean.split('/').pop() || 'media';
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const isVid = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv'].includes(ext);
      const isAud = [
        'mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'm4a', 'opus', 'wma', 'aiff', 'aif', 'mid', 'midi', 'ac3', 'dts', 'alac', 'amr'
      ].includes(ext);

      let dur = 3.0;
      let mType: 'Image' | 'Video' | 'Audio' = 'Image';
      let autoTrack = track;
      if (isVid) {
        mType = 'Video';
        try {
          const meta = await probeVideo(clean);
          dur = meta.duration_seconds || 5.0;
        } catch {}
      } else if (isAud) {
        mType = 'Audio';
        autoTrack = track.startsWith('a') ? track : 'a1';
        try {
          const meta = await probeAudio(clean);
          dur = meta.duration_seconds || 30.0;
        } catch {}
      }
      const clip = createDefaultClip(clean, fileName, dur, autoTrack, mType, currentTrackEnd);
      newClips.push(clip);
      currentTrackEnd += dur;
    }
    const merged = [...sequence, ...newClips];
    set({
      sequence: merged,
      selectedClipId: newClips.length > 0 ? newClips[0].id : get().selectedClipId,
      activeMode: 'edit',
      showFilmstrip: false,
    });
  },

  clearSequence: () => set({ sequence: [], selectedClipId: null }),

  setAudioTrack: (audioTrack) => set({ audioTrack }),

  updateAudioVolume: (volume) =>
    set((s) => (s.audioTrack ? { audioTrack: { ...s.audioTrack, volume } } : s)),

  setAudioMode: (mode) =>
    set((s) => (s.audioTrack ? { audioTrack: { ...s.audioTrack, mode } } : s)),
}));

// Proactively initialize media server port
useViewerStore.getState().initMediaPort();

