import { Handle, NodeResizer, Position, type Connection } from '@xyflow/react';
import { type PropsWithChildren } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

export function AutoTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  className = 'node-textarea',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <TextareaAutosize
      className={`${className} nodrag nopan`}
      style={{ resize: 'none', overflow: 'hidden' }}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      minRows={1}
      onChange={(e) => onChange(e.target.value)}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onKeyDownCapture={(e) => e.stopPropagation()}
    />
  );
}

export function NodeShell({
  title,
  width,
  height,
  children,
}: PropsWithChildren<{ title: string; width?: number; height?: number }>) {
  return (
    <div className="node-shell" style={{ width, height }}>
      <NodeResizer minWidth={220} minHeight={120} lineStyle={{ borderColor: 'transparent' }} handleStyle={{ background: 'var(--accent)', border: 'none', width: 8, height: 8, borderRadius: 2 }} />
      <div className="node-title">{title}</div>
      {children}
    </div>
  );
}

export function Port({
  id,
  type,
  position,
  top,
}: {
  id: string;
  type: 'source' | 'target';
  position: Position;
  top?: string;
}) {
  const portType = id.split(':')[0];

  // Validate connections at the handle level
  const isValidConnection = (connection: any) => {
    const sourceType = connection.sourceHandle?.split(':')[0];
    const targetType = connection.targetHandle?.split(':')[0];
    const result = sourceType === targetType;
    console.log(`[Port isValidConnection] handle="${id}"`, {
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      sourceType,
      targetType,
      result,
    });
    return result;
  };

  return (
    <Handle
      id={id}
      type={type}
      position={position}
      className={`port port-${portType}`}
      isValidConnection={isValidConnection}
      style={top !== undefined ? { top } : undefined}
    />
  );
}
