/**
 * Dashboard 数据聚合模块
 *
 * 职责：
 * - 复用统一监控数据装配逻辑
 * - 维护首页 Dashboard 所需的缓存与 ETag
 */
import {
  createMonitorScopeContext,
  getMonitorCacheTtlMs,
  loadDashboardGroupInfoSummaries,
  loadScopedMonitorData,
} from "./monitor-data";
import type {
  AvailabilityPeriod,
  DashboardData,
  GroupInfoSummary,
  RefreshMode,
} from "../types";
import {TtlCache} from "../utils";

interface DashboardCacheEntry {
  data?: DashboardData;
  etag?: string;
  inflight?: Promise<DashboardLoadResult>;
}

interface DashboardCacheMetrics {
  hits: number;
  misses: number;
  inflightHits: number;
}

const dashboardCacheMetrics: DashboardCacheMetrics = {
  hits: 0,
  misses: 0,
  inflightHits: 0,
};

const dashboardCache = new TtlCache<string, DashboardCacheEntry>({
  maxEntries: 50,
});

function getDashboardCacheKey(
  pollIntervalMs: number,
  providerKey: string,
  trendPeriod: AvailabilityPeriod
): string {
  return `dashboard:${pollIntervalMs}:${trendPeriod}:${providerKey}`;
}

function generateETag(data: string): string {
  let hash = 5381;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) + hash) ^ data.charCodeAt(i);
  }
  return `"${(hash >>> 0).toString(16)}"`;
}

function buildDashboardEtag(data: DashboardData): string {
  const {generatedAt, ...etagPayload} = data;
  void generatedAt;
  return generateETag(JSON.stringify(etagPayload));
}

export interface DashboardLoadResult {
  data: DashboardData;
  etag: string;
}

export function getDashboardCacheMetrics(): DashboardCacheMetrics {
  return {...dashboardCacheMetrics};
}

export function resetDashboardCacheMetrics(): void {
  dashboardCacheMetrics.hits = 0;
  dashboardCacheMetrics.misses = 0;
  dashboardCacheMetrics.inflightHits = 0;
}

export async function loadDashboardData(options?: {
  refreshMode?: RefreshMode;
  trendPeriod?: AvailabilityPeriod;
}): Promise<DashboardData> {
  const result = await loadDashboardDataInternal(options);
  return result.data;
}

export async function loadDashboardDataWithEtag(options?: {
  refreshMode?: RefreshMode;
  trendPeriod?: AvailabilityPeriod;
}): Promise<DashboardLoadResult> {
  return loadDashboardDataInternal(options);
}

async function loadDashboardDataInternal(options?: {
  refreshMode?: RefreshMode;
  trendPeriod?: AvailabilityPeriod;
}): Promise<DashboardLoadResult> {
  const context = await createMonitorScopeContext({type: "all"});
  const refreshMode = options?.refreshMode ?? "missing";
  const trendPeriod = options?.trendPeriod ?? "7d";
  const cacheKey = getDashboardCacheKey(
    context.pollIntervalMs,
    context.providerKey,
    trendPeriod
  );
  const cacheTtlMs = getMonitorCacheTtlMs(context.pollIntervalMs);
  const now = Date.now();
  const shouldBypassCache = refreshMode === "always";

  const loadData = async (): Promise<DashboardLoadResult> => {
    const [
      {providerTimelines, lastUpdated, availabilityStats, generatedAt},
      groupInfoSummaries,
    ] = await Promise.all([
      loadScopedMonitorData(context, refreshMode),
      loadDashboardGroupInfoSummaries(),
    ]);

    const data: DashboardData = {
      providerTimelines,
      groupInfos: groupInfoSummaries as GroupInfoSummary[],
      lastUpdated,
      total: providerTimelines.length,
      pollIntervalLabel: context.pollIntervalLabel,
      pollIntervalMs: context.pollIntervalMs,
      availabilityStats,
      trendPeriod,
      generatedAt,
    };

    const etag = buildDashboardEtag(data);
    dashboardCache.set(cacheKey, {data, etag}, cacheTtlMs);
    return {data, etag};
  };

  if (!shouldBypassCache) {
    const cachedState = dashboardCache.getState(cacheKey, now);
    const cached = cachedState.value;

    if (cached?.data && !cachedState.expired) {
      dashboardCacheMetrics.hits += 1;
      cached.data.generatedAt = now;
      if (!cached.etag) {
        cached.etag = buildDashboardEtag(cached.data);
      }
      return {data: cached.data, etag: cached.etag};
    }

    if (cached?.inflight) {
      dashboardCacheMetrics.inflightHits += 1;
      const result = await cached.inflight;
      const entry = dashboardCache.getState(cacheKey).value;
      if (entry && !entry.etag) {
        entry.etag = result.etag;
        dashboardCache.set(cacheKey, entry, cacheTtlMs);
      }
      return result;
    }

    dashboardCacheMetrics.misses += 1;
    const inflight = loadData().finally(() => {
      const entry = dashboardCache.getState(cacheKey).value;
      if (entry?.inflight === inflight) {
        if (entry.data || entry.etag) {
          dashboardCache.set(
            cacheKey,
            {
              data: entry.data,
              etag: entry.etag,
            },
            cacheTtlMs
          );
          return;
        }
        dashboardCache.delete(cacheKey);
      }
    });

    dashboardCache.set(
      cacheKey,
      {
        data: cached?.data,
        etag: cached?.etag,
        inflight,
      },
      cacheTtlMs
    );
    return inflight;
  }

  return loadData();
}
