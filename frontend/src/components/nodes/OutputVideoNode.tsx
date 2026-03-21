import { memo } from 'react';
import { Position, type NodeProps, type Node } from '@xyflow/react';
import type { OutputVideoData } from '../../types/workflow';
import { NodeShell, Port } from './shared';

function Component({ id, data, width, height }: NodeProps<Node<OutputVideoData>>) {
  return (
    <NodeShell title={data.label} width={width} height={height}>
      <Port id="result:in" type="target" position={Position.Left} />
      {data.resultUrl ? <video className="media-preview" src={data.resultUrl} controls /> : <div className="media-placeholder">Chưa có kết quả</div>}
      <div className="status-text">{data.message ?? 'Waiting...'}</div>
      {data.resultUrl ? (
        <a className="primary-btn link-btn" href={data.resultUrl} target="_blank" rel="noreferrer">
          Mở video kết quả
        </a>
      ) : null}
    </NodeShell>
  );
}

export const OutputVideoNode = memo(Component);
