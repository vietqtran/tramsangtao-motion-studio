import { memo, useMemo, useState } from 'react';
import { Position, type NodeProps, type Node } from '@xyflow/react';
import { ChevronDown, ChevronUp, Coins } from 'lucide-react';
import { generateMotion, getJobStatus } from '../../lib/api';
import { usePricing, getAllPricing, getPricingLabel, getAvailableServers } from '../../lib/usePricing';
import { findConnectedInput, pushResultToOutputs, useWorkflowStore } from '../../store/workflowStore';
import type { CharacterImageData, MotionAiData, MotionVideoData, OutputImageData } from '../../types/workflow';
import { AutoTextarea, NodeShell, Port } from './shared';

const SERVER_LABELS: Record<string, string> = {
  vip1: 'VIP1 (Premium)',
  vip2: 'VIP2 (Standard)',
  fast: 'Fast (Economy)',
  Cheap: 'Cheap (Budget)',
};

function Component({ id, data, width, height }: NodeProps<Node<MotionAiData>>) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const pricing = usePricing();
  const [showPricing, setShowPricing] = useState(false);

  const isBusy = data.status === 'validating' || data.status === 'rendering';
  const isSuccess = data.status === 'success';
  const isError = data.status === 'error';

  const availableServers = useMemo(() => {
    return getAvailableServers(pricing, data.model);
  }, [pricing, data.model]);

  const currentServer = useMemo(() => {
    const s = data.server_id ?? 'vip2';
    if (availableServers.length > 0 && !availableServers.includes(s)) {
      return availableServers[0];
    }
    return s;
  }, [data.server_id, availableServers]);

  const allPrices = useMemo(() => {
    return getAllPricing(pricing, data.model, currentServer);
  }, [pricing, data.model, currentServer]);

  // Find the exact match for current config
  const currentPrice = useMemo(() => {
    return allPrices.find((p) =>
      p.resolution === data.resolution && !p.audio && p.speed !== 'slow' && p.speed !== 'per-second'
    );
  }, [allPrices, data.resolution]);

  async function runMotion() {
    console.log('[runMotion] called, node id:', id);

    const imageNode = findConnectedInput(id, 'image');
    const videoNode = findConnectedInput(id, 'cover');

    const videoData = videoNode?.data as MotionVideoData | undefined;

    let characterImageFile: File | undefined;
    let characterImageUrl: string | undefined;
    if (imageNode?.type === 'outputImage') {
      const outData = imageNode.data as OutputImageData;
      characterImageUrl = outData.remoteUrl ?? outData.resultUrl;
      characterImageFile = outData.localFile;
    } else {
      const charData = imageNode?.data as CharacterImageData | undefined;
      characterImageFile = charData?.localFile;
      characterImageUrl = charData?.remoteUrl;
    }

    if (!characterImageFile && !characterImageUrl) {
      updateNodeData(id, { status: 'error', message: 'Chưa có ảnh nhân vật. Kéo ảnh vào canvas và nối vào đây.' });
      return;
    }

    if (!videoData?.motionVideoUrl || !videoData?.videoCoverUrl) {
      updateNodeData(id, { status: 'error', message: 'Video motion chưa upload xong. Nhấn Upload trên node Motion Video trước.' });
      return;
    }

    updateNodeData(id, { status: 'validating', message: 'Đang gửi job motion...' });

    try {
      const response = await generateMotion({
        motion_video_url: videoData.motionVideoUrl,
        video_cover_url: videoData.videoCoverUrl,
        ...(characterImageUrl
          ? { character_image_url: characterImageUrl }
          : { character_image: characterImageFile! }),
        prompt: data.prompt,
        model: data.model,
        mode: data.mode,
        resolution: data.resolution,
        server_id: currentServer,
      });

      updateNodeData(id, { status: 'rendering', jobId: response.job_id, message: 'Đang render... (tự động cập nhật)' });

      const poll = window.setInterval(async () => {
        try {
          const status = await getJobStatus(response.job_id);
          if (status.status === 'completed' && status.result) {
            window.clearInterval(poll);
            updateNodeData(id, { status: 'success', resultUrl: status.result, message: 'Render xong!' });
            pushResultToOutputs(id, status.result);
          } else if (status.status === 'error' || status.status === 'failed') {
            window.clearInterval(poll);
            updateNodeData(id, { status: 'error', message: status.error || 'Render thất bại từ server.' });
          }
        } catch (error) {
          window.clearInterval(poll);
          updateNodeData(id, { status: 'error', message: error instanceof Error ? error.message : 'Poll job thất bại.' });
        }
      }, 5000);
    } catch (error) {
      updateNodeData(id, { status: 'error', message: error instanceof Error ? error.message : 'Tạo job thất bại.' });
    }
  }

  const statusClass = isError
    ? 'status-text is-error'
    : isSuccess
    ? 'status-text is-success'
    : isBusy
    ? 'status-text is-loading'
    : 'status-text';

  return (
    <NodeShell title={data.label} width={width} height={height}>
      <Port id="image:in" type="target" position={Position.Left} top="35%" />
      <Port id="cover:in" type="target" position={Position.Left} top="65%" />
      <Port id="result:out" type="source" position={Position.Right} />
      <AutoTextarea
        value={data.prompt}
        placeholder="Motion prompt"
        onChange={(v) => updateNodeData(id, { prompt: v })}
      />
      <div className="node-row">
        <select value={data.model} className="node-select" onChange={(event) => updateNodeData(id, { model: event.target.value })}>
          <option value="motion-control-3.0">motion-control-3.0</option>
          <option value="motion-control-2.6">motion-control-2.6</option>
        </select>
        <select value={data.mode} className="node-select" onChange={(event) => updateNodeData(id, { mode: event.target.value })}>
          <option value="std">std</option>
          <option value="pro">pro</option>
        </select>
      </div>
      <div className="node-row" style={{ marginTop: 4 }}>
        <select value={data.resolution ?? '720p'} className="node-select" onChange={(event) => updateNodeData(id, { resolution: event.target.value })}>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
        </select>
        <select value={currentServer} className="node-select" onChange={(event) => updateNodeData(id, { server_id: event.target.value })}>
          {availableServers.length > 0 ? (
            availableServers.map((s) => (
              <option key={s} value={s}>{SERVER_LABELS[s] ?? s}</option>
            ))
          ) : (
            <option value="vip2">VIP2 (Standard)</option>
          )}
        </select>
      </div>

      {/* Current config credit */}
      {currentPrice && (
        <div className="credit-estimate">
          <Coins size={13} />
          <span>Chi phí: <strong>{currentPrice.credits}</strong> credits</span>
        </div>
      )}

      {/* Full pricing table toggle */}
      {allPrices.length > 0 && (
        <button
          className="pricing-toggle nodrag"
          onClick={() => setShowPricing((v) => !v)}
          onPointerDownCapture={(e) => e.stopPropagation()}
        >
          {showPricing ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Bảng giá ({allPrices.length} cấu hình)
        </button>
      )}
      {showPricing && allPrices.length > 0 && (
        <div className="pricing-table-wrap nodrag" onPointerDownCapture={(e) => e.stopPropagation()}>
          <table className="pricing-table">
            <thead>
              <tr><th>Cấu hình</th><th>Credits</th></tr>
            </thead>
            <tbody>
              {allPrices.map((p) => (
                <tr
                  key={p.config_key}
                  className={
                    p.resolution === data.resolution && !p.audio && p.speed !== 'slow'
                      ? 'pricing-row-active'
                      : ''
                  }
                >
                  <td>{getPricingLabel(p)}</td>
                  <td className="pricing-credits">{p.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button className="primary-btn full" disabled={isBusy} onClick={runMotion}>
        {isBusy ? <><span className="spinner" /> Đang chạy...</> : 'Run Motion'}
      </button>
      <div className={statusClass}>
        {isBusy && <span className="spinner" />}
        {data.message ?? data.status}
      </div>
      {data.resultUrl ? <video className="media-preview" src={data.resultUrl} controls /> : null}
    </NodeShell>
  );
}

export const MotionAiNode = memo(Component);
