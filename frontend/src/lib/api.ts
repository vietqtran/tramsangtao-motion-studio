const API_BASE = 'http://localhost:8787/api';

// ─── Logger ───────────────────────────────────────────────────────────────────
function logReq(label: string, data: Record<string, unknown>) {
  console.log(`[API →] ${label}`, data);
}
function logRes(label: string, data: unknown) {
  console.log(`[API ←] ${label}`, data);
}
function logErr(label: string, error: unknown) {
  console.error(`[API ✗] ${label}`, error);
}
// ─────────────────────────────────────────────────────────────────────────────

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload.error || payload.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return response.json();
}

export async function getBalance() {
  try {
    const response = await fetch(`${API_BASE}/balance`);
    const data = await parseResponse<{ balance: number; currency: string; key_prefix: string; organization: string }>(response);
    logRes('getBalance', data);
    return data;
  } catch (error) {
    logErr('getBalance', error);
    throw error;
  }
}

export async function getLimits() {
  try {
    const response = await fetch(`${API_BASE}/limits`);
    const data = await parseResponse<{
      limits: { total_concurrent: number; image_concurrent: number; video_concurrent: number; queue: number };
      active: { total: number; image: number; video: number; queued: number };
      available: { image_slots: number; video_slots: number; queue_slots: number };
    }>(response);
    logRes('getLimits', data);
    return data;
  } catch (error) {
    logErr('getLimits', error);
    throw error;
  }
}

export async function uploadImage(file: File) {
  logReq('uploadImage', { fileName: file.name, size: file.size, type: file.type });

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_BASE}/files/upload/image`, { method: 'POST', body: formData });
    const data = await parseResponse<{
      upload_id: string;
      file_id: string;
      url: string;
      type: string;
      status: string;
      content_type: string;
      size_bytes: number;
    }>(response);
    logRes('uploadImage', data);
    return data;
  } catch (error) {
    logErr('uploadImage', error);
    throw error;
  }
}

export async function uploadVideo(file: File) {
  logReq('uploadVideo', { fileName: file.name, size: file.size, type: file.type });

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_BASE}/files/upload/video`, { method: 'POST', body: formData });
    const data = await parseResponse<{
      upload_id: string;
      file_id: string;
      url: string;
      type: string;
      status: string;
      content_type: string;
      size_bytes: number;
    }>(response);
    logRes('uploadVideo', data);
    return data;
  } catch (error) {
    logErr('uploadVideo', error);
    throw error;
  }
}

export async function getUploadStatus(uploadId: string) {
  logReq('getUploadStatus', { uploadId });

  try {
    const response = await fetch(`${API_BASE}/files/upload/${uploadId}/status`);
    const data = await parseResponse<{
      upload_id: string;
      status: 'processing' | 'ready';
      url?: string;
    }>(response);
    logRes('getUploadStatus', data);
    return data;
  } catch (error) {
    logErr('getUploadStatus', error);
    throw error;
  }
}

export async function generateMotion(payload: {
  motion_video_url: string;
  video_cover_url: string;
  character_image_url?: string;
  character_image?: File;
  prompt: string;
  model: string;
  mode: 'std' | 'pro';
  resolution?: '720p' | '1080p';
  server_id?: string;
}) {
  logReq('generateMotion', {
    motion_video_url: payload.motion_video_url,
    video_cover_url: payload.video_cover_url,
    character_image_url: payload.character_image_url,
    hasImageFile: Boolean(payload.character_image),
    imageFileName: payload.character_image?.name,
    prompt: payload.prompt,
    model: payload.model,
    mode: payload.mode,
    server_id: payload.server_id,
  });

  const formData = new FormData();
  formData.append('motion_video_url', payload.motion_video_url);
  formData.append('video_cover_url', payload.video_cover_url);
  if (payload.character_image) {
    formData.append('character_image', payload.character_image);
  } else if (payload.character_image_url) {
    formData.append('character_image_url', payload.character_image_url);
  }
  formData.append('prompt', payload.prompt);
  formData.append('model', payload.model);
  formData.append('mode', payload.mode);
  if (payload.resolution) formData.append('resolution', payload.resolution);
  if (payload.server_id) formData.append('server_id', payload.server_id);

  try {
    const response = await fetch(`${API_BASE}/motion/generate`, { method: 'POST', body: formData });
    const data = await parseResponse<{ job_id: string; status: string }>(response);
    logRes('generateMotion', data);
    return data;
  } catch (error) {
    logErr('generateMotion', error);
    throw error;
  }
}

export async function generateImage(payload: {
  prompt: string;
  model: string;
  input_images?: File[];
  img_urls?: string[];
  resolution?: string;
  aspect_ratio?: string;
  speed?: string;
}) {
  logReq('generateImage', { prompt: payload.prompt, model: payload.model, imageCount: payload.input_images?.length ?? 0, aspect_ratio: payload.aspect_ratio });

  const formData = new FormData();
  formData.append('prompt', payload.prompt);
  formData.append('model', payload.model);
  payload.input_images?.forEach((f) => formData.append('input_image', f));
  payload.img_urls?.forEach((u) => formData.append('img_url', u));
  if (payload.resolution) formData.append('resolution', payload.resolution);
  if (payload.aspect_ratio) formData.append('aspect_ratio', payload.aspect_ratio);
  if (payload.speed) formData.append('speed', payload.speed);

  try {
    const response = await fetch(`${API_BASE}/image/generate`, { method: 'POST', body: formData });
    const data = await parseResponse<{ job_id: string; status: string }>(response);
    logRes('generateImage', data);
    return data;
  } catch (error) {
    logErr('generateImage', error);
    throw error;
  }
}

export async function getJobStatus(jobId: string) {
  logReq('getJobStatus', { jobId });

  try {
    const response = await fetch(`${API_BASE}/jobs/${jobId}`);
    const data = await parseResponse<{ status: 'processing' | 'completed' | 'failed' | 'error'; result: string | null; error: string | null }>(response);
    logRes('getJobStatus', data);
    return data;
  } catch (error) {
    logErr('getJobStatus', error);
    throw error;
  }
}
