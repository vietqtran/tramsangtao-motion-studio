import { memo } from 'react';
import { Position, type NodeProps, type Node } from '@xyflow/react';
import { UploadCloud, X } from 'lucide-react';
import { uploadImage } from '../../lib/api';
import { findConnectedInputByHandle, useWorkflowStore } from '../../store/workflowStore';
import type { OutputImageData } from '../../types/workflow';
import { NodeShell, Port } from './shared';

function Component({ id, data, width, height }: NodeProps<Node<OutputImageData>>) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const isConnected = Boolean(findConnectedInputByHandle(id, 'result:in'));
  const isUploading = data.uploadState === 'uploading';

  function clearImage() {
    if (data.resultUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(data.resultUrl);
    }
    updateNodeData(id, {
      resultUrl: undefined, remoteUrl: undefined, fileName: undefined,
      localFile: undefined, uploadState: undefined, message: undefined,
    });
  }

  async function uploadToServer() {
    let file = data.localFile;

    // If no local file but we have a resultUrl (e.g. from TryOn AI), fetch it as a blob
    if (!file && data.resultUrl) {
      try {
        updateNodeData(id, { uploadState: 'uploading', message: 'Đang tải ảnh từ URL...' });
        const resp = await fetch(data.resultUrl);
        const blob = await resp.blob();
        file = new File([blob], 'output-image.png', { type: blob.type || 'image/png' });
      } catch {
        updateNodeData(id, { uploadState: 'error', message: 'Không tải được ảnh từ URL.' });
        return;
      }
    }

    if (!file) {
      updateNodeData(id, { message: 'Chưa có ảnh để upload.' });
      return;
    }

    updateNodeData(id, { uploadState: 'uploading', message: 'Đang upload lên server...' });
    try {
      const response = await uploadImage(file);
      updateNodeData(id, {
        uploadState: 'uploaded',
        remoteUrl: response.url,
        message: 'Upload thành công!',
      });
    } catch (error) {
      updateNodeData(id, {
        uploadState: 'error',
        message: error instanceof Error ? error.message : 'Upload thất bại.',
      });
    }
  }

  const hasCachedImage = Boolean(data.resultUrl) && !isConnected;

  return (
    <NodeShell title={data.label} width={width} height={height}>
      <Port id="result:in" type="target" position={Position.Left} top="35%" />
      <Port id="image:out"  type="source" position={Position.Right} top="35%" />

      {data.resultUrl ? (
        <>
          <div style={{ position: 'relative' }}>
            <img className="media-preview" src={data.resultUrl} alt="output" />
            {hasCachedImage && (
              <span
                title="Ảnh được lưu trong node, không mất khi ngắt dây"
                style={{
                  position: 'absolute', top: 6, left: 6,
                  background: 'rgba(16,28,56,0.82)', color: '#7dd3fc',
                  fontSize: 11, fontWeight: 600, padding: '2px 7px',
                  borderRadius: 6, border: '1px solid #2563eb',
                  letterSpacing: '.01em', pointerEvents: 'none',
                }}
              >
                Cached
              </span>
            )}
          </div>
          <button
            className="ghost-btn"
            style={{ width: '100%', justifyContent: 'center', color: '#f87171', marginBottom: 4 }}
            onClick={clearImage}
          >
            <X size={13} /> Xóa ảnh
          </button>
        </>
      ) : (
        <div className="media-placeholder">Chưa có kết quả</div>
      )}

      <div className="status-text">
        {isUploading && <span className="spinner" />}
        {data.message ?? (isConnected ? 'Đang chờ kết quả...' : 'Waiting...')}
      </div>

      {data.remoteUrl && (
        <div className="tiny-text" style={{ wordBreak: 'break-all' }}>
          Server URL: {data.remoteUrl.slice(0, 60)}…
        </div>
      )}

      {data.resultUrl && (
        <button
          className="primary-btn"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={isUploading || data.uploadState === 'uploaded' || !data.resultUrl}
          onClick={uploadToServer}
        >
          <UploadCloud size={14} /> {data.uploadState === 'uploaded' ? 'Đã upload' : 'Upload lên server'}
        </button>
      )}

      {data.resultUrl ? (
        <a className="primary-btn link-btn" href={data.resultUrl} target="_blank" rel="noreferrer" style={{ marginTop: 4 }}>
          Mở ảnh kết quả
        </a>
      ) : null}
    </NodeShell>
  );
}

export const OutputImageNode = memo(Component);
