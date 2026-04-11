"use client";

import {useCallback} from "react";

import {DashboardView} from "@/components/dashboard-view";
import {DashboardSkeleton} from "@/components/dashboard-skeleton";
import {MonitorBootstrap} from "@/components/monitor-bootstrap";
import {fetchWithCache} from "@/lib/core/frontend-cache";
import type {AvailabilityPeriod, DashboardData} from "@/lib/types";

const DEFAULT_PERIOD: AvailabilityPeriod = "7d";

interface DashboardBootstrapProps {
  initialData?: DashboardData | null;
}

export function DashboardBootstrap({initialData = null}: DashboardBootstrapProps) {
  const loadData = useCallback(
    async (options?: {
      forceFresh?: boolean;
      onBackgroundUpdate?: (data: DashboardData) => void;
    }) => {
      const result = await fetchWithCache({
        trendPeriod: DEFAULT_PERIOD,
        forceFresh: options?.forceFresh,
        revalidateIfFresh: true,
        onBackgroundUpdate: options?.onBackgroundUpdate,
      });
      return result.data;
    },
    []
  );

  return (
    <MonitorBootstrap
      initialData={initialData}
      skeleton={<DashboardSkeleton />}
      errorMessage="数据加载失败，请稍后重试"
      logPrefix="首屏加载"
      loadData={loadData}
      render={(data) => <DashboardView initialData={data} />}
    />
  );
}
