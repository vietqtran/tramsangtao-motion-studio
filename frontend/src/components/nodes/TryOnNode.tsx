import { memo, useMemo, useRef, useState } from 'react';
import { Position, type NodeProps, type Node } from '@xyflow/react';
import { ChevronDown, ChevronUp, Coins, Upload } from 'lucide-react';
import { generateImage, getJobStatus } from '../../lib/api';
import { usePricing, getAllPricing, getPricingLabel, getAvailableServers } from '../../lib/usePricing';
import { findConnectedInputByHandle, pushResultToOutputs, useWorkflowStore } from '../../store/workflowStore';
import type { CharacterImageData, OutputImageData, ProductImageData, TryOnData } from '../../types/workflow';
import { AutoTextarea, NodeShell, Port } from './shared';

const SERVER_LABELS: Record<string, string> = {
  vip1: 'VIP1 (Premium)',
  vip2: 'VIP2 (Standard)',
  fast: 'Fast (Economy)',
  Cheap: 'Cheap (Budget)',
};

function Component({ id, data, width, height }: NodeProps<Node<TryOnData>>) {
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const pricing = usePricing();
  const [showPricing, setShowPricing] = useState(false);

  const isBusy = data.status === 'validating' || data.status === 'rendering';
  const isSuccess = data.status === 'success';
  const isError = data.status === 'error';

  const currentModel = data.model ?? 'nano-banana-pro';

  const availableServers = useMemo(() => {
    return getAvailableServers(pricing, currentModel);
  }, [pricing, currentModel]);

  const currentServer = useMemo(() => {
    const s = data.server_id ?? 'vip1';
    if (availableServers.length > 0 && !availableServers.includes(s)) {
      return availableServers[0];
    }
    return s;
  }, [data.server_id, availableServers]);

  const allPrices = useMemo(() => {
    return getAllPricing(pricing, currentModel, currentServer);
  }, [pricing, currentModel, currentServer]);

  // Find cheapest non-slow entry as "current" estimate
  const currentPrice = useMemo(() => {
    const fast = allPrices.filter((p) => p.speed !== 'slow' && p.speed !== 'per-second' && !p.audio);
    return fast.length > 0 ? fast[0] : undefined; // already sorted by credits asc
  }, [allPrices]);

  function onModelFileChange(file?: File) {
    if (!file) return;
    if (data.modelPreviewUrl) URL.revokeObjectURL(data.modelPreviewUrl);
    updateNodeData(id, { modelPreviewUrl: URL.createObjectURL(file), modelFileName: file.name, modelFile: file, status: 'idle', resultUrl: undefined, message: undefined });
  }

  function onProductFileChange(file?: File) {
    if (!file) return;
    if (data.productPreviewUrl) URL.revokeObjectURL(data.productPreviewUrl);
    updateNodeData(id, { productPreviewUrl: URL.createObjectURL(file), productFileName: file.name, productFile: file, status: 'idle', resultUrl: undefined, message: undefined });
  }

  async function runImageGen() {
    const modelNode = findConnectedInputByHandle(id, 'image:model-in');
    const productNode = findConnectedInputByHandle(id, 'image:product-in');

    function resolveFile(node: typeof modelNode, fallback: File | undefined): File | undefined {
      if (!node) return fallback;
      if (node.type === 'outputImage') return undefined;
      return (node.data as CharacterImageData | ProductImageData | undefined)?.localFile ?? fallback;
    }
    function resolveUrl(node: typeof modelNode): string | undefined {
      if (node?.type === 'outputImage') return (node.data as OutputImageData).resultUrl;
      return undefined;
    }

    const modelFile = resolveFile(modelNode, data.modelFile);
    const modelUrl = resolveUrl(modelNode);
    const productFile = resolveFile(productNode, data.productFile);
    const productUrl = resolveUrl(productNode);

    if (!modelFile && !modelUrl) {
      updateNodeData(id, { status: 'error', message: 'Chưa có ảnh người mẫu. Kết nối node ảnh hoặc upload trực tiếp.' });
      return;
    }
    if (!productFile && !productUrl) {
      updateNodeData(id, { status: 'error', message: 'Chưa có ảnh sản phẩm. Kết nối node sản phẩm hoặc upload trực tiếp.' });
      return;
    }

    updateNodeData(id, { status: 'validating', message: 'Đang gửi job tạo ảnh...' });

    try {
      const payload = {
        prompt: data.prompt?.trim() || 'The person in the first image wearing the outfit from the second image, photorealistic, high quality',
        model: currentModel,
        input_images: [modelFile, productFile].filter(Boolean) as File[],
        img_urls: [modelUrl, productUrl].filter(Boolean) as string[],
        aspect_ratio: data.aspect_ratio ?? '1:1',
        server_id: currentServer,
      };

      const response = await generateImage(payload);
      updateNodeData(id, { status: 'rendering', jobId: response.job_id, message: 'Đang xử lý... (tự động cập nhật)' });

      const poll = window.setInterval(async () => {
        try {
          const status = await getJobStatus(response.job_id);
          if (status.status === 'completed' && status.result) {
            window.clearInterval(poll);
            updateNodeData(id, { status: 'success', resultUrl: status.result, message: 'Hoàn thành!' });
            pushResultToOutputs(id, status.result);
          } else if (status.status === 'error' || status.status === 'failed') {
            window.clearInterval(poll);
            updateNodeData(id, { status: 'error', message: status.error || 'Xử lý thất bại từ server.' });
          }
        } catch (error) {
          window.clearInterval(poll);
          updateNodeData(id, { status: 'error', message: error instanceof Error ? error.message : 'Poll thất bại.' });
        }
      }, 5000);
    } catch (error) {
      updateNodeData(id, { status: 'error', message: error instanceof Error ? error.message : 'Gửi job thất bại.' });
    }
  }

  const statusClass = isError ? 'status-text is-error' : isSuccess ? 'status-text is-success' : isBusy ? 'status-text is-loading' : 'status-text';
  const modelConnected = Boolean(findConnectedInputByHandle(id, 'image:model-in'));
  const productConnected = Boolean(findConnectedInputByHandle(id, 'image:product-in'));

  return (
    <NodeShell title={data.label} width={width} height={height}>
      <Port id="image:model-in"   type="target" position={Position.Left} top="28%" />
      <Port id="image:product-in" type="target" position={Position.Left} top="62%" />
      <Port id="result:out" type="source" position={Position.Right} top="45%" />

      {/* Person/model image */}
      <div className="tryon-label">Người mẫu {modelConnected ? <span className="tryon-connected">✓ connected</span> : ''}</div>
      {!modelConnected && (
        <>
          {data.modelPreviewUrl ? (
            <img className="media-preview tryon-preview" src={data.modelPreviewUrl} alt="model" />
          ) : (
            <div className="media-placeholder tryon-placeholder">Kết nối node ảnh hoặc upload</div>
          )}
          <input ref={modelInputRef} className="hidden-input" type="file" accept="image/*" onChange={(e) => onModelFileChange(e.target.files?.[0])} />
          <button className="ghost-btn full-btn" disabled={isBusy} onClick={() => modelInputRef.current?.click()}>
            <Upload size={14} /> {data.modelFileName ?? 'Chọn ảnh mẫu'}
          </button>
        </>
      )}

      {/* Product/clothing image */}
      <div className="tryon-label" style={{ marginTop: 10 }}>
        Trang phục {productConnected ? <span className="tryon-connected">✓ connected</span> : ''}
      </div>
      {!productConnected && (
        <>
          {data.productPreviewUrl ? (
            <img className="media-preview tryon-preview" src={data.productPreviewUrl} alt="product" />
          ) : (
            <div className="media-placeholder tryon-placeholder">Kết nối node ảnh hoặc upload</div>
          )}
          <input ref={productInputRef} className="hidden-input" type="file" accept="image/*" onChange={(e) => onProductFileChange(e.target.files?.[0])} />
          <button className="ghost-btn full-btn" disabled={isBusy} onClick={() => productInputRef.current?.click()}>
            <Upload size={14} /> {data.productFileName ?? 'Chọn ảnh trang phục'}
          </button>
        </>
      )}

      {/* Prompt */}
      <div className="tryon-label" style={{ marginTop: 10 }}>Prompt (tuỳ chọn)</div>
      <AutoTextarea
        value={data.prompt ?? ''}
        placeholder="Mặc định: người mẫu mặc trang phục từ ảnh 2..."
        disabled={isBusy}
        onChange={(v) => updateNodeData(id, { prompt: v })}
      />

      <select
        className="node-select"
        style={{ marginTop: 6 }}
        value={currentModel}
        disabled={isBusy}
        onChange={(e) => updateNodeData(id, { model: e.target.value })}
      >
        <optgroup label="Nano Banana">
          <option value="nano-banana-pro">Nano Banana PRO</option>
          <option value="nano-banana">Nano Banana</option>
          <option value="nano-banana-2">Nano Banana 2</option>
        </optgroup>
        <optgroup label="Google">
          <option value="imagen-4">Imagen 4</option>
          <option value="imagen-4-fast">Imagen 4 Fast</option>
          <option value="imagen-4-ultra">Imagen 4 Ultra</option>
        </optgroup>
        <optgroup label="Khác">
          <option value="flux-2-pro">Flux 2 Pro</option>
          <option value="chat-gpt-image">ChatGPT Image</option>
          <option value="seedream-4.5">Seedream 4.5</option>
          <option value="kling-o1-image">Kling O1 Image</option>
          <option value="grok-image">Grok Image</option>
        </optgroup>
      </select>

      <div className="node-row" style={{ marginTop: 6 }}>
        <select
          className="node-select"
          value={data.aspect_ratio ?? '1:1'}
          disabled={isBusy}
          onChange={(e) => updateNodeData(id, { aspect_ratio: e.target.value })}
        >
          <option value="1:1">1:1 (Vuông)</option>
          <option value="9:16">9:16 (Dọc TikTok)</option>
          <option value="16:9">16:9 (Ngang YouTube)</option>
          <option value="3:4">3:4 (Dọc Vừa)</option>
          <option value="4:3">4:3 (Ngang Vừa)</option>
        </select>
        <select
          className="node-select"
          value={currentServer}
          disabled={isBusy}
          onChange={(e) => updateNodeData(id, { server_id: e.target.value })}
        >
          {availableServers.length > 0 ? (
            availableServers.map((s) => (
              <option key={s} value={s}>{SERVER_LABELS[s] ?? s}</option>
            ))
          ) : (
            <option value="vip1">VIP1 (Premium)</option>
          )}
        </select>
      </div>

      {/* Current config credit */}
      {currentPrice && (
        <div className="credit-estimate">
          <Coins size={13} />
          <span>Từ <strong>{currentPrice.credits}</strong> credits</span>
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
                <tr key={p.config_key}>
                  <td>{getPricingLabel(p)}</td>
                  <td className="pricing-credits">{p.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button className="primary-btn full" style={{ marginTop: 8 }} disabled={isBusy} onClick={runImageGen}>
        {isBusy ? <><span className="spinner" /> Đang xử lý...</> : 'Run Image AI'}
      </button>

      <div className={statusClass}>
        {isBusy && <span className="spinner" />}
        {data.message ?? data.status}
      </div>

      {data.resultUrl ? (
        <>
          <div className="tryon-label" style={{ marginTop: 10 }}>Kết quả</div>
          <img className="media-preview" src={data.resultUrl} alt="result" />
          <a className="primary-btn link-btn" href={data.resultUrl} target="_blank" rel="noreferrer" style={{ marginTop: 6 }}>
            Mở ảnh kết quả
          </a>
        </>
      ) : null}
    </NodeShell>
  );
}

export const TryOnNode = memo(Component);
