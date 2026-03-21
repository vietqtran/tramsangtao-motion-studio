import { memo } from 'react';
import { Position, type NodeProps, type Node } from '@xyflow/react';
import { generateMotion, getJobStatus } from '../../lib/api';
import { findConnectedInput, pushResultToOutputs, useWorkflowStore } from '../../store/workflowStore';
import type { CharacterImageData, MotionAiData, MotionVideoData, OutputImageData } from '../../types/workflow';
import { AutoTextarea, NodeShell, Port } from './shared';

function Component({ id, data, width, height }: NodeProps<Node<MotionAiData>>) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const isBusy = data.status === 'validating' || data.status === 'rendering';
  const isSuccess = data.status === 'success';
  const isError = data.status === 'error';

  async function runMotion() {
    console.log('[runMotion] called, node id:', id);

    const imageNode = findConnectedInput(id, 'image');
    const videoNode = findConnectedInput(id, 'cover');

    console.log('[runMotion] connected nodes:', {
      imageNode: imageNode?.id,
      imageNodeType: imageNode?.type,
      videoNode: videoNode?.id,
      videoNodeType: videoNode?.type,
    });

    const videoData = videoNode?.data as MotionVideoData | undefined;

    // Resolve image: characterImage (file/url) or outputImage (remoteUrl > resultUrl)
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

    console.log('[runMotion] data check:', {
      imageNodeType: imageNode?.type,
      hasImageFile: Boolean(characterImageFile),
      hasImageUrl: Boolean(characterImageUrl),
      motionVideoUrl: videoData?.motionVideoUrl,
      videoCoverUrl: videoData?.videoCoverUrl,
    });

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
        server_id: data.server_id,
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
        <select value={data.server_id ?? 'fast'} className="node-select" onChange={(event) => updateNodeData(id, { server_id: event.target.value })}>
          <option value="vip1">VIP1 (Premium)</option>
          <option value="vip2">VIP2 (Standard)</option>
          <option value="fast">Fast (Economy)</option>
          <option value="Cheap">Cheap (Budget)</option>
        </select>
      </div>
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
