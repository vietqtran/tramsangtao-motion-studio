import type { Edge, Node } from '@xyflow/react';

export type WorkflowNodeType = 'textNote' | 'characterImage' | 'motionVideo' | 'motionAi' | 'outputVideo' | 'tryOn' | 'outputImage' | 'productImage';

export type UploadState = 'idle' | 'uploading' | 'uploaded' | 'processing' | 'completed' | 'error';
export type JobState = 'idle' | 'validating' | 'rendering' | 'success' | 'error';

export type TextNoteData = {
  label: string;
  content: string;
};

export type CharacterImageData = {
  label: string;
  previewUrl?: string;
  remoteUrl?: string;
  fileName?: string;
  localFile?: File;
  uploadState: UploadState;
  message?: string;
};

export type MotionVideoData = {
  label: string;
  previewUrl?: string;
  motionVideoUrl?: string;
  videoCoverUrl?: string;
  taskId?: string;
  fileName?: string;
  localFile?: File;
  costs?: Record<string, number>;
  uploadState: UploadState;
  message?: string;
};

export type MotionAiData = {
  label: string;
  prompt: string;
  model: string;
  mode: 'std' | 'pro';
  resolution: '720p' | '1080p';
  server_id?: string;
  status: JobState;
  jobId?: string;
  resultUrl?: string;
  message?: string;
};

export type ProductImageData = {
  label: string;
  previewUrl?: string;
  fileName?: string;
  localFile?: File;
  message?: string;
};

export type TryOnData = {
  label: string;
  prompt: string;
  model: string;
  aspect_ratio: string;
  // person/model image
  modelPreviewUrl?: string;
  modelFileName?: string;
  modelFile?: File;
  // product/clothing image
  productPreviewUrl?: string;
  productFileName?: string;
  productFile?: File;
  // job
  status: JobState;
  jobId?: string;
  resultUrl?: string;
  message?: string;
};

export type OutputVideoData = {
  label: string;
  resultUrl?: string;
  message?: string;
};

export type OutputImageData = {
  label: string;
  resultUrl?: string;
  remoteUrl?: string;
  fileName?: string;
  localFile?: File;
  uploadState?: UploadState;
  message?: string;
};

export type AppNodeData = TextNoteData | CharacterImageData | MotionVideoData | MotionAiData | TryOnData | OutputVideoData | OutputImageData | ProductImageData;
export type AppNode = Node<AppNodeData, WorkflowNodeType>;
export type AppEdge = Edge;

export type WorkflowSnapshot = {
  nodes: AppNode[];
  edges: AppEdge[];
  viewport: { x: number; y: number; zoom: number };
};
