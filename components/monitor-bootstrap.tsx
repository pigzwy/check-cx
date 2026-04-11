"use client";

import {useEffect, useState} from "react";

interface MonitorBootstrapLoadOptions<T> {
  forceFresh?: boolean;
  onBackgroundUpdate?: (data: T) => void;
}

interface MonitorBootstrapProps<T> {
  initialData?: T | null;
  skeleton: React.ReactNode;
  errorMessage: string;
  logPrefix: string;
  loadData: (options?: MonitorBootstrapLoadOptions<T>) => Promise<T>;
  render: (data: T) => React.ReactNode;
}

export function MonitorBootstrap<T>({
  initialData = null,
  skeleton,
  errorMessage,
  logPrefix,
  loadData,
  render,
}: MonitorBootstrapProps<T>) {
  const [data, setData] = useState<T | null>(initialData);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      return;
    }

    let isActive = true;
    const run = async () => {
      try {
        const nextData = await loadData({
          onBackgroundUpdate: (updatedData) => {
            if (isActive) {
              setData(updatedData);
            }
          },
        });
        if (!isActive) {
          return;
        }
        setLoadError(null);
        setData(nextData);
      } catch (error) {
        if (!isActive) {
          return;
        }
        console.error(`[check-cx] ${logPrefix}失败`, error);
        setLoadError(errorMessage);
      }
    };

    run().catch(() => undefined);
    return () => {
      isActive = false;
    };
  }, [errorMessage, initialData, loadData, logPrefix]);

  const handleReload = async () => {
    try {
      const nextData = await loadData({ forceFresh: true });
      setLoadError(null);
      setData(nextData);
    } catch (error) {
      console.error(`[check-cx] ${logPrefix}失败`, error);
      setLoadError(errorMessage);
    }
  };

  if (!data) {
    return (
      <div>
        {skeleton}
        {loadError && (
          <div className="mt-6 flex justify-center">
            <div className="inline-flex items-center gap-3 rounded-full border border-border/60 bg-background/60 px-4 py-2 text-sm text-muted-foreground">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => {
                  void handleReload();
                }}
                className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
              >
                重新加载
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return <>{render(data)}</>;
}
