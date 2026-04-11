/**
 * 分组数据加载模块
 *
 * 职责：
 * - 复用统一监控数据装配逻辑
 * - 提供分组 Dashboard 所需的数据与缓存
 */
import {
  createMonitorScopeContext,
  getAvailableGroupNames,
  getMonitorCacheTtlMs,
  loadGroupScopeMeta,
  loadScopedMonitorData,
} from "./monitor-data";
import type {
  AvailabilityPeriod,
  AvailabilityStatsMap,
  ProviderTimeline,
  RefreshMode,
} from "../types";
import {TtlCache} from "../utils";

interface GroupDashboardCacheEntry {
  data?: GroupDashboardData | null;
  inflight?: Promise<GroupDashboardData | null>;
}

const groupDashboardCache = new TtlCache<string, GroupDashboardCacheEntry>({
  maxEntries: 100,
});

function getGroupCacheKey(
  groupName: string,
  pollIntervalMs: number,
  providerKey: string,
  trendPeriod: AvailabilityPeriod
): string {
  return `group:${groupName}:${pollIntervalMs}:${trendPeriod}:${providerKey}`;
}

export interface GroupDashboardData {
  groupName: string;
  displayName: string;
  tags: string;
  providerTimelines: ProviderTimeline[];
  lastUpdated: string | null;
  total: number;
  pollIntervalLabel: string;
  pollIntervalMs: number;
  availabilityStats: AvailabilityStatsMap;
  trendPeriod: AvailabilityPeriod;
  generatedAt: number;
  websiteUrl?: string | null;
}

export async function getAvailableGroups(): Promise<string[]> {
  const context = await createMonitorScopeContext({type: "all"});
  return getAvailableGroupNames(context.allConfigs);
}

export async function loadGroupDashboardData(
  targetGroupName: string,
  options?: {refreshMode?: RefreshMode; trendPeriod?: AvailabilityPeriod}
): Promise<GroupDashboardData | null> {
  const context = await createMonitorScopeContext({
    type: "group",
    groupName: targetGroupName,
  });
  if (context.scopedConfigs.length === 0) {
    return null;
  }

  const refreshMode = options?.refreshMode ?? "missing";
  const trendPeriod = options?.trendPeriod ?? "7d";
  const cacheKey = getGroupCacheKey(
    targetGroupName,
    context.pollIntervalMs,
    context.providerKey,
    trendPeriod
  );
  const cacheTtlMs = getMonitorCacheTtlMs(context.pollIntervalMs);
  const now = Date.now();
  const shouldBypassCache = refreshMode === "always";

  const loadData = async (): Promise<GroupDashboardData | null> => {
    const [
      {providerTimelines, lastUpdated, availabilityStats, generatedAt},
      scopeMeta,
    ] = await Promise.all([
      loadScopedMonitorData(context, refreshMode),
      loadGroupScopeMeta(targetGroupName),
    ]);

    const data: GroupDashboardData = {
      groupName: targetGroupName,
      displayName: scopeMeta.displayName,
      tags: scopeMeta.tags,
      providerTimelines,
      lastUpdated,
      total: providerTimelines.length,
      pollIntervalLabel: context.pollIntervalLabel,
      pollIntervalMs: context.pollIntervalMs,
      availabilityStats,
      trendPeriod,
      generatedAt,
      websiteUrl: scopeMeta.websiteUrl,
    };

    groupDashboardCache.set(cacheKey, {data}, cacheTtlMs);
    return data;
  };

  if (!shouldBypassCache) {
    const cachedState = groupDashboardCache.getState(cacheKey, now);
    const cached = cachedState.value;

    if (cached?.data && !cachedState.expired) {
      cached.data.generatedAt = now;
      return cached.data;
    }

    if (cached?.inflight) {
      return cached.inflight;
    }

    const inflight = loadData().finally(() => {
      const entry = groupDashboardCache.getState(cacheKey).value;
      if (entry?.inflight === inflight) {
        if (entry.data) {
          groupDashboardCache.set(cacheKey, {data: entry.data}, cacheTtlMs);
          return;
        }
        groupDashboardCache.delete(cacheKey);
      }
    });

    groupDashboardCache.set(
      cacheKey,
      {
        data: cached?.data,
        inflight,
      },
      cacheTtlMs
    );
    return inflight;
  }

  return loadData();
}
