import { memo, useRef } from 'react';
import { Position, type NodeProps, type Node } from '@xyflow/react';
import { Upload } from 'lucide-react';
import { uploadVideo } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';
import type { MotionVideoData } from '../../types/workflow';
import { AutoTextarea, NodeShell, Port } from './shared';

function Component({ id, data, width, height }: NodeProps<Node<MotionVideoData>>) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const isBusy = data.uploadState === 'uploading' || data.uploadState === 'processing';
  const isDone = data.uploadState === 'completed';
  const isError = data.uploadState === 'error';

  async function onFileChange(file?: File) {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    if (data.previewUrl) URL.revokeObjectURL(data.previewUrl);
    updateNodeData(id, {
      previewUrl,
      fileName: file.name,
      localFile: file,
      uploadState: 'idle',
      motionVideoUrl: undefined,
      videoCoverUrl: undefined,
      taskId: undefined,
      message: undefined,
    });
  }

  async function uploadCurrent() {
    if (!data.localFile) {
      updateNodeData(id, { message: 'Chưa có file video.' });
      return;
    }

    updateNodeData(id, { uploadState: 'uploading', message: 'Đang gửi video lên server...' });

    try {
      const response = await uploadVideo(data.localFile);
      updateNodeData(id, {
        uploadState: 'completed',
        motionVideoUrl: response.url,
        videoCoverUrl: response.url,
        message: 'Video sẵn sàng!',
      });
    } catch (error) {
      updateNodeData(id, {
        uploadState: 'error',
        message: error instanceof Error ? error.message : 'Upload video thất bại.',
      });
    }
  }

  const statusClass = isError ? 'status-text is-error' : isDone ? 'status-text is-success' : isBusy ? 'status-text is-loading' : 'status-text';

  return (
    <NodeShell title={data.label} width={width} height={height}>
      <Port id="cover:out" type="source" position={Position.Right} top="50%" />
      {data.previewUrl ? (
        <video className="media-preview" src={data.previewUrl} controls muted />
      ) : (
        <div className="media-placeholder">Drop video here</div>
      )}
      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        accept="video/*"
        onChange={(event) => onFileChange(event.target.files?.[0])}
      />
      <div className="node-row">
        <button className="ghost-btn" disabled={isBusy} onClick={() => inputRef.current?.click()}>
          <Upload size={14} /> Chọn video
        </button>
        <button className="primary-btn" disabled={isBusy || isDone} onClick={uploadCurrent}>
          {isBusy ? <><span className="spinner" /> Đang xử lý...</> : isDone ? '✓ Đã upload' : 'Upload'}
        </button>
      </div>

      <div className={statusClass}>
        {isBusy && <span className="spinner" />}
        {data.message ?? data.uploadState}
      </div>
      {data.costs ? (
        <div className="tiny-text">
          Credits: {Object.entries(data.costs).map(([k, v]) => `${k}: ${v}`).join(' | ')}
        </div>
      ) : null}
    </NodeShell>
  );
}

export const MotionVideoNode = memo(Component);
