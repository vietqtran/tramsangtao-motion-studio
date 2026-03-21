import { memo, useRef } from 'react';
import { Position, type NodeProps, type Node } from '@xyflow/react';
import { Upload } from 'lucide-react';
import { uploadImage } from '../../lib/api';
import { useWorkflowStore } from '../../store/workflowStore';
import type { CharacterImageData } from '../../types/workflow';
import { AutoTextarea, NodeShell, Port } from './shared';

function Component({ id, data, width, height }: NodeProps<Node<CharacterImageData>>) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  async function onFileChange(file?: File) {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    if (data.previewUrl) URL.revokeObjectURL(data.previewUrl);

    updateNodeData(id, {
      previewUrl,
      fileName: file.name,
      localFile: file,
      uploadState: 'idle',
      remoteUrl: undefined,
      message: 'Đã thay file local.',
    });
  }

  async function uploadCurrent() {
    if (!data.localFile) {
      updateNodeData(id, { message: 'Node này chưa có file local.' });
      return;
    }

    updateNodeData(id, { uploadState: 'uploading', message: 'Đang upload ảnh...' });
    try {
      const response = await uploadImage(data.localFile);
      updateNodeData(id, {
        uploadState: 'uploaded',
        remoteUrl: response.url,
        message: 'Upload ảnh thành công.',
      });
    } catch (error) {
      updateNodeData(id, {
        uploadState: 'error',
        message: error instanceof Error ? error.message : 'Upload thất bại.',
      });
    }
  }

  return (
    <NodeShell title={data.label} width={width} height={height}>
      <Port id="image:out" type="source" position={Position.Right} />
      {data.previewUrl ? <img className="media-preview" src={data.previewUrl} alt={data.fileName} /> : <div className="media-placeholder">Drop image here</div>}
      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        accept="image/*"
        onChange={(event) => onFileChange(event.target.files?.[0])}
      />
      <div className="node-row">
        <button className="ghost-btn" onClick={() => inputRef.current?.click()}>
          <Upload size={14} /> Chọn ảnh
        </button>
        <button className="primary-btn" onClick={uploadCurrent}>Upload</button>
      </div>

      <div className="status-text">{data.uploadState} {data.message ? `• ${data.message}` : ''}</div>
    </NodeShell>
  );
}

export const CharacterImageNode = memo(Component);
