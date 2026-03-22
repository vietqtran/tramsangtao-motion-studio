import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 8787;
const BASE_URL = process.env.TRAMSANGTAO_BASE_URL || 'https://api.tramsangtao.com/v1';

function getApiKey() {
  return (process.env.TRAMSANGTAO_API_KEY || '').trim();
}

function getKeyPreview() {
  const key = getApiKey();
  if (!key) return null;
  return `${key.slice(0, 10)}...`;
}

// ─── Logger ──────────────────────────────────────────────────────────────────
function log(tag, data) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${tag}]`, JSON.stringify(data, null, 2));
}

function logRequest(req) {
  log('REQ', {
    method: req.method,
    url: req.url,
    body: req.body && Object.keys(req.body).length ? req.body : undefined,
    file: req.file
      ? { fieldname: req.file.fieldname, originalname: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype }
      : undefined,
    files: req.files
      ? (Array.isArray(req.files)
          ? req.files.map((f) => ({ originalname: f.originalname, size: f.size }))
          : Object.fromEntries(Object.entries(req.files).map(([k, v]) => [k, { originalname: v[0].originalname, size: v[0].size }])))
      : undefined,
  });
}

function logUpstream(method, url, formKeys) {
  log('UPSTREAM →', { method, url: `${BASE_URL}${url}`, formKeys });
}

function logUpstreamResponse(url, status, data) {
  log('UPSTREAM ←', { url, status, data });
}

function logError(url, error) {
  log('ERROR', {
    url,
    message: error.message,
    status: error.response?.status,
    data: error.response?.data,
  });
}
// ─────────────────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '20mb' }));

function ensureApiKey(res) {
  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(500).json({ error: 'Thiếu TRAMSANGTAO_API_KEY trong môi trường backend.' });
    return false;
  }
  return true;
}

async function tssRequest(config) {
  const apiKey = getApiKey();
  const reqHeaders = {
    Authorization: `Bearer ${apiKey}`,
    ...(config.headers || {}),
  };

  return axios({
    baseURL: BASE_URL,
    timeout: 120000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    ...config,
    headers: reqHeaders,
  });
}

function mapAxiosError(error, res) {
  if (error.response) {
    res.status(error.response.status).json(error.response.data);
    return;
  }
  res.status(500).json({ error: error.message || 'Unknown server error' });
}

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, baseUrl: BASE_URL, hasApiKey: Boolean(getApiKey()), keyPreview: getKeyPreview() });
});

// ─── Models ──────────────────────────────────────────────────────────────────
app.get('/api/balance', async (req, res) => {
  if (!ensureApiKey(res)) return;
  logRequest(req);
  logUpstream('GET', '/balance', []);
  try {
    const response = await tssRequest({ method: 'GET', url: '/balance' });
    logUpstreamResponse('/balance', response.status, response.data);
    res.json(response.data);
  } catch (error) {
    logError('/balance', error);
    mapAxiosError(error, res);
  }
});

app.get('/api/models', async (req, res) => {
  if (!ensureApiKey(res)) return;
  logRequest(req);
  logUpstream('GET', '/models', []);
  try {
    const response = await tssRequest({ method: 'GET', url: '/models' });
    logUpstreamResponse('/models', response.status, response.data);
    res.json(response.data);
  } catch (error) {
    logError('/models', error);
    mapAxiosError(error, res);
  }
});

// ─── Pricing ──────────────────────────────────────────────────────────────────
app.get('/api/models/pricing', async (req, res) => {
  if (!ensureApiKey(res)) return;
  logRequest(req);
  const qs = req.url.split('?')[1] || '';
  const upstreamUrl = `/models/pricing${qs ? `?${qs}` : ''}`;
  logUpstream('GET', upstreamUrl, []);
  try {
    const response = await tssRequest({ method: 'GET', url: upstreamUrl });
    logUpstreamResponse(upstreamUrl, response.status, response.data);
    res.json(response.data);
  } catch (error) {
    logError(upstreamUrl, error);
    mapAxiosError(error, res);
  }
});

// ─── Limits ──────────────────────────────────────────────────────────────────
app.get('/api/limits', async (req, res) => {
  if (!ensureApiKey(res)) return;
  logRequest(req);
  logUpstream('GET', '/limits', []);
  try {
    const response = await tssRequest({ method: 'GET', url: '/limits' });
    logUpstreamResponse('/limits', response.status, response.data);
    res.json(response.data);
  } catch (error) {
    logError('/limits', error);
    mapAxiosError(error, res);
  }
});

// ─── Upload: image (unified) ──────────────────────────────────────────────────
app.post('/api/files/upload/image', upload.single('file'), async (req, res) => {
  if (!ensureApiKey(res)) return;
  logRequest(req);

  if (!req.file) {
    log('REJECTED', { reason: 'Thiếu file ảnh', url: req.url });
    res.status(400).json({ error: 'Thiếu file ảnh.' });
    return;
  }

  try {
    const form = new FormData();
    form.append('file', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });

    logUpstream('POST', '/files/upload/image', ['file']);
    const response = await tssRequest({ method: 'POST', url: '/files/upload/image', data: form, headers: form.getHeaders() });
    logUpstreamResponse('/files/upload/image', response.status, response.data);
    res.json(response.data);
  } catch (error) {
    logError('/files/upload/image', error);
    mapAxiosError(error, res);
  }
});

// ─── Upload: video (unified) ──────────────────────────────────────────────────
app.post('/api/files/upload/video', upload.single('file'), async (req, res) => {
  if (!ensureApiKey(res)) return;
  logRequest(req);

  if (!req.file) {
    log('REJECTED', { reason: 'Thiếu file video', url: req.url });
    res.status(400).json({ error: 'Thiếu file video.' });
    return;
  }

  try {
    const form = new FormData();
    form.append('file', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });

    logUpstream('POST', '/files/upload/video', ['file']);
    const response = await tssRequest({ method: 'POST', url: '/files/upload/video', data: form, headers: form.getHeaders() });
    logUpstreamResponse('/files/upload/video', response.status, response.data);
    res.json(response.data);
  } catch (error) {
    logError('/files/upload/video', error);
    mapAxiosError(error, res);
  }
});

// ─── Upload: status ───────────────────────────────────────────────────────────
app.get('/api/files/upload/:uploadId/status', async (req, res) => {
  if (!ensureApiKey(res)) return;
  logRequest(req);
  const url = `/files/upload/${req.params.uploadId}/status`;
  logUpstream('GET', url, []);
  try {
    const response = await tssRequest({ method: 'GET', url });
    logUpstreamResponse(url, response.status, response.data);
    res.json(response.data);
  } catch (error) {
    logError(url, error);
    mapAxiosError(error, res);
  }
});

// ─── Motion: generate ─────────────────────────────────────────────────────────
// Accepts multipart (with optional character_image file) OR JSON (character_image_url only)
app.post(
  '/api/motion/generate',
  upload.single('character_image'),
  async (req, res) => {
    if (!ensureApiKey(res)) return;
    logRequest(req);

    const motion_video_url = req.body.motion_video_url;
    const video_cover_url = req.body.video_cover_url;
    const character_image_url = req.body.character_image_url;
    const prompt = req.body.prompt || 'motion control';
    const mode = req.body.mode || 'std';
    const model = req.body.model || 'motion-control-3.0';
    const resolution = req.body.resolution;
    const server_id = req.body.server_id;
    const imageFile = req.file; // present when sent as multipart file

    log('GENERATE PARAMS', {
      motion_video_url,
      video_cover_url,
      character_image_url,
      hasImageFile: Boolean(imageFile),
      prompt,
      mode,
      model,
      resolution,
      server_id,
    });

    if (!motion_video_url || !video_cover_url) {
      log('REJECTED', { reason: 'Thiếu motion_video_url hoặc video_cover_url' });
      res.status(400).json({ error: 'Thiếu motion_video_url hoặc video_cover_url.' });
      return;
    }

    if (!imageFile && !character_image_url) {
      log('REJECTED', { reason: 'Thiếu character_image file hoặc character_image_url' });
      res.status(400).json({ error: 'Thiếu character_image (file) hoặc character_image_url.' });
      return;
    }

    try {
      const form = new FormData();
      form.append('motion_video_url', motion_video_url);
      form.append('video_cover_url', video_cover_url);
      if (imageFile) {
        form.append('character_image', imageFile.buffer, { filename: imageFile.originalname, contentType: imageFile.mimetype });
      } else {
        form.append('character_image_url', character_image_url);
      }
      form.append('prompt', prompt);
      form.append('mode', mode);
      form.append('model', model);
      if (resolution) form.append('resolution', resolution);
      if (server_id) form.append('server_id', server_id);

      const formKeys = ['motion_video_url', 'video_cover_url', imageFile ? 'character_image(file)' : 'character_image_url', 'prompt', 'mode', 'model', resolution ? `resolution=${resolution}` : '', server_id ? `server_id=${server_id}` : ''].filter(Boolean);
      logUpstream('POST', '/motion/generate', formKeys);

      const response = await tssRequest({ method: 'POST', url: '/motion/generate', data: form, headers: form.getHeaders() });
      logUpstreamResponse('/motion/generate', response.status, response.data);
      res.json(response.data);
    } catch (error) {
      logError('/motion/generate', error);
      mapAxiosError(error, res);
    }
  },
);

// ─── Image: generate ─────────────────────────────────────────────────────────
app.post(
  '/api/image/generate',
  upload.array('input_image'),
  async (req, res) => {
    if (!ensureApiKey(res)) return;
    logRequest(req);

    const prompt = req.body.prompt;
    const model = req.body.model ?? 'nano-banana-pro';
    const resolution = req.body.resolution;
    const aspect_ratio = req.body.aspect_ratio;
    const speed = req.body.speed;
    const server_id = req.body.server_id;
    const img_urls = req.body.img_url
      ? (Array.isArray(req.body.img_url) ? req.body.img_url : [req.body.img_url])
      : [];
    const inputFiles = req.files ?? [];

    log('IMAGE GEN PARAMS', {
      prompt, model, resolution, aspect_ratio, speed,
      inputFileCount: inputFiles.length,
      imgUrlCount: img_urls.length,
    });

    if (!prompt) {
      res.status(400).json({ error: 'Thiếu prompt.' });
      return;
    }

    try {
      const form = new FormData();
      form.append('prompt', prompt);
      form.append('model', model);
      inputFiles.forEach((f) => form.append('input_image', f.buffer, { filename: f.originalname, contentType: f.mimetype }));
      img_urls.forEach((u) => form.append('img_url', u));
      if (resolution) form.append('resolution', resolution);
      if (aspect_ratio) form.append('aspect_ratio', aspect_ratio);
      if (speed) form.append('speed', speed);
      if (server_id) form.append('server_id', server_id);

      const formKeys = ['prompt', 'model', `input_image×${inputFiles.length}`];
      if (aspect_ratio) formKeys.push(`aspect_ratio=${aspect_ratio}`);
      if (resolution) formKeys.push(`resolution=${resolution}`);
      if (server_id) formKeys.push(`server_id=${server_id}`);
      
      logUpstream('POST', '/image/generate', formKeys);
      const response = await tssRequest({ method: 'POST', url: '/image/generate', data: form, headers: form.getHeaders(), timeout: 300000 });
      logUpstreamResponse('/image/generate', response.status, response.data);
      res.json(response.data);
    } catch (error) {
      logError('/image/generate', error);
      mapAxiosError(error, res);
    }
  },
);

// ─── Jobs: status ─────────────────────────────────────────────────────────────
app.get('/api/jobs/:jobId', async (req, res) => {
  if (!ensureApiKey(res)) return;
  logRequest(req);
  const url = `/jobs/${req.params.jobId}`;
  logUpstream('GET', url, []);
  try {
    const response = await tssRequest({ method: 'GET', url });
    logUpstreamResponse(url, response.status, response.data);
    res.json(response.data);
  } catch (error) {
    logError(url, error);
    mapAxiosError(error, res);
  }
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`Proxying to: ${BASE_URL}`);
  console.log(`API key: ${getKeyPreview() || '(not set)'}`);
});
