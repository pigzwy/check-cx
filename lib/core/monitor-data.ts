import {getAvailabilityStats} from "../database/availability";
import {loadProviderConfigsFromDB} from "../database/config-loader";
import {getGroupInfo, loadGroupInfos} from "../database/group-info";
import {ensureOfficialStatusPoller} from "./official-status-poller";
import {buildProviderTimelines, loadSnapshotForScope} from "./health-snapshot-service";
import {getPollingIntervalLabel, getPollingIntervalMs} from "./polling-config";
import type {
  AvailabilityStatsMap,
  GroupInfoSummary,
  ProviderConfig,
  ProviderTimeline,
  RefreshMode,
} from "../types";
import {UNGROUPED_DISPLAY_NAME, UNGROUPED_KEY} from "../types";

export const DEFAULT_MONITOR_CACHE_TTL_MS = 5 * 60 * 1000;

export type MonitorScope =
  | { type: "all" }
  | { type: "group"; groupName: string };

export interface MonitorScopeContext {
  scope: MonitorScope;
  allConfigs: ProviderConfig[];
  scopedConfigs: ProviderConfig[];
  activeConfigs: ProviderConfig[];
  allowedIds: Set<string>;
  providerKey: string;
  pollIntervalMs: number;
  pollIntervalLabel: string;
  snapshotCacheKey: string;
}

export interface ScopedMonitorData {
  providerTimelines: ProviderTimeline[];
  lastUpdated: string | null;
  availabilityStats: AvailabilityStatsMap;
  generatedAt: number;
}

export interface GroupScopeMeta {
  displayName: string;
  websiteUrl?: string | null;
  tags: string;
}

export function getMonitorCacheTtlMs(pollIntervalMs: number): number {
  if (Number.isFinite(pollIntervalMs) && pollIntervalMs > 0) {
    return pollIntervalMs;
  }
  return DEFAULT_MONITOR_CACHE_TTL_MS;
}

function buildProviderKey(configs: ProviderConfig[]): string {
  if (configs.length === 0) {
    return "__empty__";
  }
  return configs.map((config) => config.id).sort().join("|");
}

function buildSnapshotCacheKey(
  scope: MonitorScope,
  pollIntervalMs: number,
  providerKey: string
): string {
  if (scope.type === "all") {
    return `dashboard:${pollIntervalMs}:${providerKey}`;
  }
  return `group:${scope.groupName}:${pollIntervalMs}:${providerKey}`;
}

function resolveScopedConfigs(
  allConfigs: ProviderConfig[],
  scope: MonitorScope
): ProviderConfig[] {
  if (scope.type === "all") {
    return allConfigs;
  }

  const isUngrouped = scope.groupName === UNGROUPED_KEY;
  return allConfigs.filter((config) => {
    if (isUngrouped) {
      return !config.groupName;
    }
    return config.groupName === scope.groupName;
  });
}

function getLastUpdated(providerTimelines: ProviderTimeline[]): string | null {
  let lastUpdated: string | null = null;
  let lastUpdatedMs = 0;

  for (const timeline of providerTimelines) {
    const checkedAtMs = Date.parse(timeline.latest.checkedAt);
    if (Number.isFinite(checkedAtMs) && checkedAtMs > lastUpdatedMs) {
      lastUpdatedMs = checkedAtMs;
      lastUpdated = timeline.latest.checkedAt;
    }
  }

  return lastUpdated;
}

export async function createMonitorScopeContext(
  scope: MonitorScope
): Promise<MonitorScopeContext> {
  ensureOfficialStatusPoller();

  const allConfigs = await loadProviderConfigsFromDB();
  const scopedConfigs = resolveScopedConfigs(allConfigs, scope);
  const activeConfigs = scopedConfigs.filter((config) => !config.is_maintenance);
  const providerKey = buildProviderKey(activeConfigs);
  const pollIntervalMs = getPollingIntervalMs();
  const pollIntervalLabel = getPollingIntervalLabel();

  return {
    scope,
    allConfigs,
    scopedConfigs,
    activeConfigs,
    allowedIds: new Set(activeConfigs.map((config) => config.id)),
    providerKey,
    pollIntervalMs,
    pollIntervalLabel,
    snapshotCacheKey: buildSnapshotCacheKey(scope, pollIntervalMs, providerKey),
  };
}

export async function loadScopedMonitorData(
  context: MonitorScopeContext,
  refreshMode: RefreshMode
): Promise<ScopedMonitorData> {
  const history = await loadSnapshotForScope(
    {
      cacheKey: context.snapshotCacheKey,
      pollIntervalMs: context.pollIntervalMs,
      activeConfigs: context.activeConfigs,
      allowedIds: context.allowedIds,
    },
    refreshMode
  );

  const providerTimelines = buildProviderTimelines(history, context.scopedConfigs);
  const availabilityStats = await getAvailabilityStats(
    context.scopedConfigs.map((config) => config.id)
  );

  return {
    providerTimelines,
    lastUpdated: getLastUpdated(providerTimelines),
    availabilityStats,
    generatedAt: Date.now(),
  };
}

export async function loadDashboardGroupInfoSummaries(): Promise<GroupInfoSummary[]> {
  const groupInfos = await loadGroupInfos();
  return groupInfos.map((info) => ({
    groupName: info.group_name,
    websiteUrl: info.website_url ?? null,
    tags: info.tags ?? "",
  }));
}

export async function loadGroupScopeMeta(groupName: string): Promise<GroupScopeMeta> {
  if (groupName === UNGROUPED_KEY) {
    return {
      displayName: UNGROUPED_DISPLAY_NAME,
      tags: "",
    };
  }

  const groupInfo = await getGroupInfo(groupName);
  return {
    displayName: groupName,
    websiteUrl: groupInfo?.website_url,
    tags: groupInfo?.tags ?? "",
  };
}

export function getAvailableGroupNames(configs: ProviderConfig[]): string[] {
  const groupSet = new Set<string>();

  for (const config of configs) {
    if (config.groupName) {
      groupSet.add(config.groupName);
    }
  }

  if (configs.some((config) => !config.groupName)) {
    groupSet.add(UNGROUPED_KEY);
  }

  return [...groupSet].sort();
}
