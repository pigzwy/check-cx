/**
 * 可用性统计查询模块
 */

import "server-only";

import {createAdminClient} from "../supabase/admin";
import {getPollingIntervalMs} from "../core/polling-config";
import type {AvailabilityStats} from "../types/database";
import type {AvailabilityStat, AvailabilityStatsMap} from "../types";
import {logError} from "../utils";

const ALL_CONFIGS_CACHE_KEY = "__all__";

interface AvailabilityCache {
  data: AvailabilityStatsMap;
  fetchedAt: number;
}

interface AvailabilityCacheMetrics {
  hits: number;
  misses: number;
}

const cache = new Map<string, AvailabilityCache>();

const metrics: AvailabilityCacheMetrics = {
  hits: 0,
  misses: 0,
};

export function getAvailabilityCacheMetrics(): AvailabilityCacheMetrics {
  return { ...metrics };
}

export function resetAvailabilityCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
}

function normalizeIds(ids?: Iterable<string> | null): string[] | null {
  if (!ids) {
    return null;
  }
  const normalized = Array.from(new Set(Array.from(ids).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right)
  );
  return normalized.length > 0 ? normalized : [];
}

function getCacheKey(ids: string[] | null): string {
  if (!ids) {
    return ALL_CONFIGS_CACHE_KEY;
  }
  return ids.join("|");
}

function mapRows(rows: AvailabilityStats[] | null): AvailabilityStatsMap {
  if (!rows || rows.length === 0) {
    return {};
  }

  const mapped: AvailabilityStatsMap = {};
  for (const row of rows) {
    const entry: AvailabilityStat = {
      period: row.period,
      totalChecks: Number(row.total_checks ?? 0),
      operationalCount: Number(row.operational_count ?? 0),
      availabilityPct:
        row.availability_pct === null ? null : Number(row.availability_pct),
    };

    if (!mapped[row.config_id]) {
      mapped[row.config_id] = [];
    }
    mapped[row.config_id].push(entry);
  }

  return mapped;
}

export async function getAvailabilityStats(
  configIds?: Iterable<string> | null
): Promise<AvailabilityStatsMap> {
  const normalizedIds = normalizeIds(configIds);
  if (Array.isArray(normalizedIds) && normalizedIds.length === 0) {
    return {};
  }

  const ttl = getPollingIntervalMs();
  const now = Date.now();
  const cacheKey = getCacheKey(normalizedIds);
  const cached = cache.get(cacheKey);
  if (cached && now - cached.fetchedAt < ttl) {
    metrics.hits += 1;
    return cached.data;
  }
  metrics.misses += 1;

  const supabase = createAdminClient();
  let query = supabase
    .from("availability_stats")
    .select("config_id, period, total_checks, operational_count, availability_pct")
    .order("config_id", { ascending: true })
    .order("period", { ascending: true });

  if (normalizedIds) {
    query = query.in("config_id", normalizedIds);
  }

  const { data, error } = await query;

  if (error) {
    logError("读取可用性统计失败", error);
    return {};
  }

  const mapped = mapRows(data as AvailabilityStats[] | null);
  cache.set(cacheKey, {
    data: mapped,
    fetchedAt: now,
  });

  return mapped;
}
