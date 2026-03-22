import { useEffect, useState } from 'react';
import { getPricing, type PricingEntry } from './api';

// Simple module-level cache so we don't refetch on every node mount
let cachedPricing: PricingEntry[] | null = null;
let fetchPromise: Promise<PricingEntry[]> | null = null;

function fetchOnce(): Promise<PricingEntry[]> {
  if (cachedPricing) return Promise.resolve(cachedPricing);
  if (!fetchPromise) {
    fetchPromise = getPricing()
      .then((res) => {
        cachedPricing = res.pricing;
        return res.pricing;
      })
      .catch(() => {
        fetchPromise = null;
        return [] as PricingEntry[];
      });
  }
  return fetchPromise;
}

export function usePricing() {
  const [pricing, setPricing] = useState<PricingEntry[]>(cachedPricing ?? []);

  useEffect(() => {
    fetchOnce().then(setPricing);
  }, []);

  return pricing;
}

/**
 * Map UI model names to pricing API model names where they differ.
 */
const MODEL_NAME_MAP: Record<string, string> = {
  'chat-gpt-image': 'image-gpt',
};

function resolvePricingModel(uiModel: string): string {
  return MODEL_NAME_MAP[uiModel] ?? uiModel;
}

/**
 * Get available servers for a given model from pricing data.
 */
export function getAvailableServers(
  pricing: PricingEntry[],
  uiModel: string,
): string[] {
  const model = resolvePricingModel(uiModel);
  const servers = new Set<string>();
  for (const p of pricing) {
    if (p.model === model) servers.add(p.server);
  }
  return [...servers];
}

/**
 * Get ALL pricing entries for a model+server combo (including slow, audio, all resolutions).
 * Sorted by credits ascending.
 */
export function getAllPricing(
  pricing: PricingEntry[],
  uiModel: string,
  server: string,
): PricingEntry[] {
  const model = resolvePricingModel(uiModel);
  return pricing
    .filter((p) => p.model === model && p.server === server)
    .sort((a, b) => a.credits - b.credits);
}

/**
 * Build a human-readable label for a pricing entry config.
 * e.g. "1k · fast" or "720p · 5s" or "default"
 */
export function getPricingLabel(entry: PricingEntry): string {
  const parts: string[] = [];
  if (entry.resolution) parts.push(entry.resolution);
  if (entry.duration) parts.push(entry.duration);
  if (entry.audio) parts.push('audio');
  if (entry.speed === 'slow') parts.push('slow');
  else if (entry.speed === 'per-second') parts.push('/giây');
  else if (parts.length > 0) parts.push('fast');
  return parts.length > 0 ? parts.join(' · ') : 'default';
}
