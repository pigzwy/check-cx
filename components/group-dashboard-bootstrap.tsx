"use client";

import {useCallback} from "react";

import {GroupDashboardView} from "@/components/group-dashboard-view";
import {GroupDashboardSkeleton} from "@/components/dashboard-skeleton";
import {MonitorBootstrap} from "@/components/monitor-bootstrap";
import {fetchGroupWithCache} from "@/lib/core/group-frontend-cache";
import type {GroupDashboardData} from "@/lib/core/group-data";
import type {AvailabilityPeriod} from "@/lib/types";

const DEFAULT_PERIOD: AvailabilityPeriod = "7d";

interface GroupDashboardBootstrapProps {
  groupName: string;
  initialData?: GroupDashboardData | null;
}

export function GroupDashboardBootstrap({
  groupName,
  initialData = null,
}: GroupDashboardBootstrapProps) {
  const loadData = useCallback(
    async (options?: {
      forceFresh?: boolean;
      onBackgroundUpdate?: (data: GroupDashboardData) => void;
    }) => {
      const result = await fetchGroupWithCache({
        groupName,
        trendPeriod: DEFAULT_PERIOD,
        forceFresh: options?.forceFresh,
        revalidateIfFresh: true,
        onBackgroundUpdate: options?.onBackgroundUpdate,
      });
      return result.data;
    },
    [groupName]
  );

  return (
    <MonitorBootstrap
      initialData={initialData}
      skeleton={<GroupDashboardSkeleton />}
      errorMessage="数据加载失败，请稍后重试"
      logPrefix="分组首屏加载"
      loadData={loadData}
      render={(data) => (
        <GroupDashboardView groupName={groupName} initialData={data} />
      )}
    />
  );
}
