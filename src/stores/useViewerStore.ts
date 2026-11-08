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
  setAppMode,
  saveProjectFile,
  readProjectFile,
  saveFileDialog,
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

export type TrackType = string;

export interface TimelineLayer {
  id: string;
  name: string;
  index: number;
  muted?: boolean;
  locked?: boolean;
}

export interface MediaSourceItem {
  id: string;
  path: string;
  fileName: string;
  duration: number;
  mediaType: 'Image' | 'Video' | 'Audio';
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

export interface SequenceClip {
  id: string;
  sourceId?: string;
  path: string;
  fileName: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  timelineStart: number;
  track: string; // layerId, e.g. 'layer-2'
  layerId: string;
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

export interface HistorySnapshot {
  description: string;
  timestamp: number;
  layers: TimelineLayer[];
  sequence: SequenceClip[];
  sources: MediaSourceItem[];
}

export const createDefaultClip = (
  path: string,
  fileName: string,
  duration: number,
  layerId: string = 'layer-2',
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
  track: layerId,
  layerId,
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

  // Sequence Storyboard, Multi-layer, Sources & History
  sequence: SequenceClip[];
  layers: TimelineLayer[];
  sources: MediaSourceItem[];
  selectedClipId: string | null;
  draggedSource: MediaSourceItem | null;
  setDraggedSource: (src: MediaSourceItem | null) => void;
  audioTrack: AudioTrackConfig | null;

  // History Stack & Undo/Redo
  history: HistorySnapshot[];
  historyIndex: number;
  pushHistory: (description: string) => void;
  undo: () => void;
  redo: () => void;

  // Project persistence & dirty state
  isProjectDirty: boolean;
  projectFilePath: string | null;
  promptSaveBeforeExit: boolean;
  setPromptSaveBeforeExit: (prompt: boolean) => void;
  requestExitStudio: () => void;
  saveProject: (customPath?: string) => Promise<string | null>;
  loadProject: (filePath: string) => Promise<boolean>;

  // Dynamic Layer Actions
  addLayer: () => TimelineLayer;
  deleteLayer: (layerId: string) => void;
  toggleLayerMute: (layerId: string) => void;
  toggleLayerLock: (layerId: string) => void;

  // Source Actions
  addSource: (item: MediaSourceItem) => void;
  importSources: (filePaths: string[]) => Promise<void>;
  removeSource: (id: string) => void;
  clearSources: () => void;
  addClipToLayer: (source: MediaSourceItem, layerId: string, timelineStart: number) => SequenceClip;

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
  layers: [
    { id: 'layer-1', name: 'Layer 1', index: 1, muted: false, locked: false },
    { id: 'layer-2', name: 'Layer 2', index: 2, muted: false, locked: false },
  ],
  sources: [],
  selectedClipId: null,
  draggedSource: null,
  setDraggedSource: (draggedSource) => set({ draggedSource }),
  audioTrack: null,
  centerViewAction: null,

  history: [],
  historyIndex: -1,
  isProjectDirty: false,
  projectFilePath: null,
  promptSaveBeforeExit: false,
  setPromptSaveBeforeExit: (promptSaveBeforeExit) => set({ promptSaveBeforeExit }),

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
    const clampedZ = Math.max(minZ, Math.min(zoom, minZ * 32.0));
    if (clampedZ <= minZ + 0.001) {
      set({ zoom: clampedZ, pan: { x: 0, y: 0 } });
    } else {
      set({ zoom: clampedZ });
    }
  },
  setFitScale: (fitScale) => set({ fitScale: Math.max(0.001, fitScale) }),
  setPan: (pan) => {
    const { zoom, fitScale } = get();
    if (zoom <= (fitScale || 1.0) + 0.001) {
      set({ pan: { x: 0, y: 0 } });
    } else {
      set({ pan });
    }
  },
  setZoomAndPan: (zoom, pan) => {
    const minZ = get().fitScale || 0.05;
    const clampedZ = Math.max(minZ, Math.min(zoom, minZ * 32.0));
    if (clampedZ <= minZ + 0.001) {
      set({ zoom: clampedZ, pan: { x: 0, y: 0 } });
    } else {
      set({ zoom: clampedZ, pan });
    }
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
    const { items, currentIndex } = get();
    const current = items[currentIndex];
    const isVideoOrAudio = current?.media_type === 'Video' || current?.media_type === 'Audio' || !current;

    if (activeMode === 'edit') {
      if (isVideoOrAudio) {
        get().enterStudioMode();
      } else {
        set({ activeMode: 'edit' });
      }
    } else {
      if (isVideoOrAudio && get().isProjectDirty) {
        get().requestExitStudio();
      } else {
        set({ activeMode: 'view' });
      }
    }
  },
  enterStudioMode: () => {
    const { isPlaying, items, currentIndex, sequence, duration, layers, sources } = get();
    if (isPlaying) {
      get().setIsPlaying(false);
    }
    const current = items[currentIndex];
    let nextLayers = layers && layers.length > 0 ? [...layers] : [
      { id: 'layer-1', name: 'Layer 1', index: 1, muted: false, locked: false },
      { id: 'layer-2', name: 'Layer 2', index: 2, muted: false, locked: false },
    ];
    let nextSeq = [...sequence];
    let nextSources = [...sources];
    let selectedId = get().selectedClipId;

    if (nextSeq.length === 0 && current) {
      const isAud = current.media_type === 'Audio';
      const isVid = current.media_type === 'Video';
      const dur = duration > 0 ? duration : isVid || isAud ? 5.0 : 3.0;

      // By default put video in the second layer for user convenience!
      const targetLayerId = 'layer-2';
      const clip = createDefaultClip(
        current.path,
        current.file_name,
        dur,
        targetLayerId,
        isAud ? 'Audio' : isVid ? 'Video' : 'Image',
        0,
      );
      nextSeq = [clip];
      selectedId = clip.id;

      if (!nextSources.some((s) => s.path === current.path)) {
        nextSources.push({
          id: `src_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          path: current.path,
          fileName: current.file_name,
          duration: dur,
          mediaType: isAud ? 'Audio' : isVid ? 'Video' : 'Image',
        });
      }
    }

    setAppMode('edit');

    set({
      activeMode: 'edit',
      showFilmstrip: false,
      showInspector: false,
      layers: nextLayers,
      sequence: nextSeq,
      sources: nextSources,
      selectedClipId: selectedId,
    });
    get().pushHistory('Enter Studio Mode');
  },
  exitStudioMode: () => {
    setAppMode('view');
    set({
      activeMode: 'view',
      showFilmstrip: true,
      promptSaveBeforeExit: false,
    });
  },
  requestExitStudio: () => {
    const { isProjectDirty } = get();
    if (isProjectDirty) {
      set({ promptSaveBeforeExit: true });
    } else {
      get().exitStudioMode();
    }
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

  removeClipFromSequence: (id) => {
    const { sequence, selectedClipId } = get();
    const nextSeq = sequence.filter((c) => c.id !== id);
    const nextSelected = selectedClipId === id ? null : selectedClipId;
    set({ sequence: nextSeq, selectedClipId: nextSelected, isProjectDirty: true });
    get().pushHistory('Remove Clip');
  },

  moveClipInSequence: (fromIndex, toIndex) => {
    const { sequence } = get();
    if (fromIndex < 0 || fromIndex >= sequence.length) return;
    if (toIndex < 0 || toIndex >= sequence.length) return;
    const nextSeq = [...sequence];
    const [moved] = nextSeq.splice(fromIndex, 1);
    nextSeq.splice(toIndex, 0, moved);
    set({ sequence: nextSeq, isProjectDirty: true });
    get().pushHistory('Reorder Clips');
  },

  updateClipDuration: (id, duration) => {
    set((s) => ({
      sequence: s.sequence.map((c) => (c.id === id ? { ...c, duration, trimEnd: duration } : c)),
      isProjectDirty: true,
    }));
  },

  updateClipTrim: (id, trimStart, trimEnd) => {
    set((s) => ({
      sequence: s.sequence.map((c) => (c.id === id ? { ...c, trimStart, trimEnd } : c)),
      isProjectDirty: true,
    }));
  },

  updateClipTrimRange: (id, trimStart, trimEnd) => {
    set((s) => ({
      sequence: s.sequence.map((c) => {
        if (c.id !== id) return c;
        const validStart = Math.max(0, Math.min(trimStart, c.duration - 0.05));
        const validEnd = Math.max(validStart + 0.05, Math.min(trimEnd, c.duration));
        return { ...c, trimStart: validStart, trimEnd: validEnd };
      }),
      isProjectDirty: true,
    }));
  },

  updateClipProperties: (id, partial) => {
    set((s) => ({
      sequence: s.sequence.map((c) => (c.id === id ? { ...c, ...partial } : c)),
      isProjectDirty: true,
    }));
  },

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
      isProjectDirty: true,
    });
    get().pushHistory('Split Clip at Playhead');
  },

  deleteSelectedClip: () => {
    const { sequence, selectedClipId } = get();
    if (!selectedClipId) return;
    const next = sequence.filter((c) => c.id !== selectedClipId);
    set({
      sequence: next,
      selectedClipId: null,
      isProjectDirty: true,
    });
    get().pushHistory('Delete Clip');
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
      isProjectDirty: true,
    });
    get().pushHistory('Duplicate Clip');
  },

  moveClipOnTimeline: (id, timelineStart, track) => {
    set((s) => ({
      sequence: s.sequence.map((c) => {
        if (c.id !== id) return c;
        const targetTrack = track || c.layerId || c.track;
        return {
          ...c,
          timelineStart: Math.max(0, timelineStart),
          track: targetTrack,
          layerId: targetTrack,
        };
      }),
      isProjectDirty: true,
    }));
  },

  newTimelineProject: (_mode?: 'video' | 'audio') => {
    set({
      sequence: [],
      sources: [],
      layers: [
        { id: 'layer-1', name: 'Layer 1', index: 1, muted: false, locked: false },
        { id: 'layer-2', name: 'Layer 2', index: 2, muted: false, locked: false },
      ],
      selectedClipId: null,
      audioTrack: null,
      activeMode: 'edit',
      isProjectDirty: false,
      projectFilePath: null,
      history: [],
      historyIndex: -1,
      zoom: 1.0,
      pan: { x: 0, y: 0 },
    });
    setAppMode('edit');
  },

  importFilesToSequence: async (filePaths: string[], track: TrackType = 'layer-2') => {
    const newClips: SequenceClip[] = [];
    const { sequence } = get();
    let currentTrackEnd = 0;
    const existingTrackClips = sequence.filter((c) => c.track === track || c.layerId === track);
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
          dur = meta.duration_seconds || 30.0;
        } catch {}
      }
      const clip = createDefaultClip(clean, fileName, dur, track, mType, currentTrackEnd);
      newClips.push(clip);
      currentTrackEnd += dur;
    }
    const merged = [...sequence, ...newClips];
    set({
      sequence: merged,
      selectedClipId: newClips.length > 0 ? newClips[0].id : get().selectedClipId,
      activeMode: 'edit',
      showFilmstrip: false,
      isProjectDirty: true,
    });
    get().pushHistory('Import Files to Timeline');
  },

  clearSequence: () => {
    set({ sequence: [], selectedClipId: null, isProjectDirty: true });
    get().pushHistory('Clear Timeline');
  },

  setAudioTrack: (audioTrack) => set({ audioTrack }),

  updateAudioVolume: (volume) =>
    set((s) => (s.audioTrack ? { audioTrack: { ...s.audioTrack, volume }, isProjectDirty: true } : s)),

  setAudioMode: (mode) =>
    set((s) => (s.audioTrack ? { audioTrack: { ...s.audioTrack, mode }, isProjectDirty: true } : s)),

  // History & Undo / Redo
  pushHistory: (description: string) => {
    const { layers, sequence, sources, history, historyIndex } = get();
    const snapshot: HistorySnapshot = {
      description,
      timestamp: Date.now(),
      layers: JSON.parse(JSON.stringify(layers)),
      sequence: JSON.parse(JSON.stringify(sequence)),
      sources: JSON.parse(JSON.stringify(sources)),
    };
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(snapshot);
    if (newHistory.length > 50) newHistory.shift();
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
      isProjectDirty: true,
    });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const targetIndex = historyIndex - 1;
    const snap = history[targetIndex];
    set({
      layers: JSON.parse(JSON.stringify(snap.layers)),
      sequence: JSON.parse(JSON.stringify(snap.sequence)),
      sources: JSON.parse(JSON.stringify(snap.sources)),
      historyIndex: targetIndex,
      isProjectDirty: true,
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const targetIndex = historyIndex + 1;
    const snap = history[targetIndex];
    set({
      layers: JSON.parse(JSON.stringify(snap.layers)),
      sequence: JSON.parse(JSON.stringify(snap.sequence)),
      sources: JSON.parse(JSON.stringify(snap.sources)),
      historyIndex: targetIndex,
      isProjectDirty: true,
    });
  },

  // Dynamic Layer Management
  addLayer: () => {
    const { layers } = get();
    const nextIdx = layers.length + 1;
    const newL: TimelineLayer = {
      id: `layer-${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `Layer ${nextIdx}`,
      index: nextIdx,
      muted: false,
      locked: false,
    };
    set({ layers: [...layers, newL], isProjectDirty: true });
    get().pushHistory(`Add Layer ${nextIdx}`);
    return newL;
  },

  deleteLayer: (layerId: string) => {
    const { layers, sequence } = get();
    if (layers.length <= 1) return;
    const nextLayers = layers.filter((l) => l.id !== layerId);
    const nextSeq = sequence.filter((c) => c.layerId !== layerId && c.track !== layerId);
    set({ layers: nextLayers, sequence: nextSeq, isProjectDirty: true });
    get().pushHistory('Delete Layer');
  },

  toggleLayerMute: (layerId: string) => {
    set((s) => ({
      layers: s.layers.map((l) => (l.id === layerId ? { ...l, muted: !l.muted } : l)),
      isProjectDirty: true,
    }));
  },

  toggleLayerLock: (layerId: string) => {
    set((s) => ({
      layers: s.layers.map((l) => (l.id === layerId ? { ...l, locked: !l.locked } : l)),
      isProjectDirty: true,
    }));
  },

  // Sources Management
  addSource: (item: MediaSourceItem) => {
    const { sources } = get();
    if (sources.some((s) => s.path === item.path)) return;
    set({ sources: [...sources, item], isProjectDirty: true });
    get().pushHistory(`Add Source ${item.fileName}`);
  },

  importSources: async (filePaths: string[]) => {
    const { sources } = get();
    const next = [...sources];
    for (const fp of filePaths) {
      const clean = fp.replace(/^file:\/\//, '');
      if (next.some((s) => s.path === clean)) continue;
      const fileName = clean.split('/').pop() || 'media';
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const isVid = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv'].includes(ext);
      const isAud = [
        'mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'm4a', 'opus', 'wma', 'aiff', 'aif', 'mid', 'midi', 'ac3', 'dts', 'alac', 'amr'
      ].includes(ext);

      let dur = 5.0;
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
      next.push({
        id: `src_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        path: clean,
        fileName,
        duration: dur,
        mediaType: mType,
      });
    }
    set({ sources: next, isProjectDirty: true });
    get().pushHistory('Import Sources');
  },

  removeSource: (id: string) => {
    set((s) => ({ sources: s.sources.filter((item) => item.id !== id), isProjectDirty: true }));
    get().pushHistory('Remove Source');
  },

  clearSources: () => {
    set({ sources: [], isProjectDirty: true });
    get().pushHistory('Clear Sources');
  },

  addClipToLayer: (source: MediaSourceItem, layerId: string, timelineStart: number) => {
    const { layers, sequence } = get();
    let targetLayerId = layerId;
    const targetLayer = layers.find((l) => l.id === layerId);
    if (!targetLayer) {
      const newL = get().addLayer();
      targetLayerId = newL.id;
    }
    const newClip = createDefaultClip(
      source.path,
      source.fileName,
      source.duration,
      targetLayerId,
      source.mediaType,
      Math.max(0, timelineStart),
    );
    newClip.sourceId = source.id;
    set({
      sequence: [...sequence, newClip],
      selectedClipId: newClip.id,
      isProjectDirty: true,
    });
    get().pushHistory(`Add ${source.fileName} to ${targetLayerId}`);
    return newClip;
  },

  // Project Persistence (.vexedit)
  saveProject: async (customPath?: string) => {
    const { layers, sequence, sources, history, projectFilePath } = get();
    let targetPath = customPath || projectFilePath;
    if (!targetPath) {
      targetPath =
        (await saveFileDialog('project.vexedit', 'VexEdit Project (*.vexedit)', ['vexedit'])) || null;
    }
    if (!targetPath) return null;
    if (!targetPath.endsWith('.vexedit')) {
      targetPath += '.vexedit';
    }

    const projectData = {
      aerovex: 'vexedit',
      version: 1,
      savedAt: new Date().toISOString(),
      sources,
      layers,
      sequence,
      history: history.slice(-20),
    };

    await saveProjectFile(targetPath, JSON.stringify(projectData, null, 2));
    set({ projectFilePath: targetPath, isProjectDirty: false, promptSaveBeforeExit: false });
    return targetPath;
  },

  loadProject: async (filePath: string) => {
    try {
      const content = await readProjectFile(filePath);
      const data = JSON.parse(content);
      if (data.aerovex !== 'vexedit') {
        throw new Error('Not a valid .vexedit project');
      }
      const restoredLayers = data.layers || [
        { id: 'layer-1', name: 'Layer 1', index: 1, muted: false, locked: false },
        { id: 'layer-2', name: 'Layer 2', index: 2, muted: false, locked: false },
      ];
      set({
        sources: data.sources || [],
        layers: restoredLayers,
        sequence: data.sequence || [],
        history: data.history || [],
        historyIndex: (data.history?.length || 1) - 1,
        projectFilePath: filePath,
        isProjectDirty: false,
        activeMode: 'edit',
        selectedClipId: data.sequence?.[0]?.id || null,
        currentTime: 0,
        showFilmstrip: false,
        showInspector: false,
      });
      setAppMode('edit');
      return true;
    } catch (e) {
      console.error('Failed to load project:', e);
      return false;
    }
  },
}));

// Proactively initialize media server port
useViewerStore.getState().initMediaPort();

