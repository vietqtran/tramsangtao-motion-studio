import { memo, useRef } from 'react';
import { Position, type NodeProps, type Node } from '@xyflow/react';
import { Upload } from 'lucide-react';
import { useWorkflowStore } from '../../store/workflowStore';
import type { ProductImageData } from '../../types/workflow';
import { NodeShell, Port } from './shared';

function Component({ id, data, width, height }: NodeProps<Node<ProductImageData>>) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  function onFileChange(file?: File) {
    if (!file) return;
    if (data.previewUrl) URL.revokeObjectURL(data.previewUrl);
    updateNodeData(id, {
      previewUrl: URL.createObjectURL(file),
      fileName: file.name,
      localFile: file,
      message: undefined,
    });
  }

  return (
    <NodeShell title={data.label} width={width} height={height}>
      <Port id="image:out" type="source" position={Position.Right} />
      {data.previewUrl ? (
        <img className="media-preview" src={data.previewUrl} alt={data.fileName} />
      ) : (
        <div className="media-placeholder">Drop product image here</div>
      )}
      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        accept="image/*"
        onChange={(e) => onFileChange(e.target.files?.[0])}
      />
      <div className="node-row">
        <button className="ghost-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => inputRef.current?.click()}>
          <Upload size={14} /> Chọn ảnh sản phẩm
        </button>
      </div>
      {data.message ? <div className="status-text">{data.message}</div> : null}
    </NodeShell>
  );
}

export const ProductImageNode = memo(Component);
