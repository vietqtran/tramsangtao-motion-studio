import { memo } from 'react';
import { Position, type NodeProps, type Node } from '@xyflow/react';
import { useWorkflowStore } from '../../store/workflowStore';
import type { TextNoteData } from '../../types/workflow';
import { AutoTextarea, NodeShell, Port } from './shared';

function Component({ id, data, width, height }: NodeProps<Node<TextNoteData>>) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  return (
    <NodeShell title={data.label} width={width} height={height}>
      <AutoTextarea
        value={data.content}
        placeholder="Ghi chú workflow..."
        onChange={(v) => updateNodeData(id, { content: v })}
      />
      <Port id="text:out" type="source" position={Position.Right} />
    </NodeShell>
  );
}

export const TextNoteNode = memo(Component);
