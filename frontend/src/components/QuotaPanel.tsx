import { useEffect, useState } from 'react';
import { getBalance, getLimits } from '../lib/api';

type Balance = { balance: number; currency: string; key_prefix: string; organization: string };
type Limits = {
  limits: { total_concurrent: number; video_concurrent: number };
  active: { total: number; video: number };
  available: { video_slots: number };
};

export function QuotaPanel() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const [b, l] = await Promise.all([getBalance(), getLimits()]);
      setBalance(b);
      setLimits(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi kết nối backend');
    }
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 30000);
    return () => window.clearInterval(id);
  }, []);

  if (error) {
    return (
      <div className="quota-panel quota-error">
        <span>⚠ {error}</span>
        <button className="ghost-btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={refresh}>Retry</button>
      </div>
    );
  }

  if (!balance || !limits) {
    return <div className="quota-panel"><span className="spinner" /> Đang tải quota...</div>;
  }

  const usedSlots = limits.active.total;
  const totalSlots = limits.limits.total_concurrent;

  return (
    <div className="quota-panel">
      <div className="quota-row">
        <span className="quota-label">Tổ chức</span>
        <span className="quota-value">{balance.organization}</span>
      </div>
      <div className="quota-row">
        <span className="quota-label">API Key</span>
        <span className="quota-value quota-mono">{balance.key_prefix}</span>
      </div>
      <div className="quota-divider" />
      <div className="quota-row">
        <span className="quota-label">Số dư</span>
        <span className="quota-value quota-balance">{balance.balance.toLocaleString()} {balance.currency}</span>
      </div>
      <div className="quota-row">
        <span className="quota-label">Slot đang dùng</span>
        <span className={`quota-value ${usedSlots >= totalSlots ? 'quota-warn' : ''}`}>
          {usedSlots} / {totalSlots}
        </span>
      </div>
      <div className="quota-row">
        <span className="quota-label">Video slots trống</span>
        <span className="quota-value">{limits.available.video_slots}</span>
      </div>
      <button className="ghost-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 6, fontSize: 12 }} onClick={refresh}>
        Làm mới
      </button>
    </div>
  );
}
