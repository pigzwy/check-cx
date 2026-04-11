# Monitor Slimming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在保留监控首页、分组页、定时检测与历史统计能力的前提下，收敛重复链路并减轻运行时与维护成本。

**Architecture:** 以“合并重复实现、保留现有接口”为原则，先统一服务端数据装配入口，再合并客户端 bootstrap，并把零散的 TTL `Map` 缓存抽成共享工具。轮询器生命周期改为单一显式入口，避免隐式副作用。

**Tech Stack:** Next.js App Router, TypeScript, Supabase, in-memory TTL cache

---

### Task 1: 合并服务端监控数据加载器

**Files:**
- Create: `lib/core/monitor-data.ts`
- Modify: `lib/core/dashboard-data.ts`
- Modify: `lib/core/group-data.ts`
- Modify: `lib/core/health-snapshot-service.ts`

**Step 1: 抽取共享 scope 与基础装配逻辑**

实现统一的 scope 解析与监控数据装配函数，支持全站与分组两种范围。

**Step 2: 保持现有导出接口不变**

让 `loadDashboardData*` 与 `loadGroupDashboardData` 变成薄封装，继续返回原有结构。

**Step 3: 运行定向验证**

Run: `pnpm lint`
Expected: 无新增 lint 错误

### Task 2: 合并客户端 bootstrap 逻辑

**Files:**
- Create: `components/monitor-bootstrap.tsx`
- Modify: `components/dashboard-bootstrap.tsx`
- Modify: `components/group-dashboard-bootstrap.tsx`

**Step 1: 抽取共享客户端加载状态机**

把 `initialData`、错误处理、强刷、后台刷新复用到一个通用 bootstrap 组件。

**Step 2: 保持页面组件调用方式稳定**

让现有 dashboard/group bootstrap 只做轻包装，避免页面层大改。

**Step 3: 运行定向验证**

Run: `pnpm lint`
Expected: 无新增 lint 错误

### Task 3: 统一 TTL 缓存工具

**Files:**
- Create: `lib/utils/ttl-cache.ts`
- Modify: `lib/database/availability.ts`
- Modify: `lib/core/dashboard-data.ts`
- Modify: `lib/core/group-data.ts`

**Step 1: 实现最小共享 TTL cache**

提供 `get/set/deleteExpired/clear` 与 `maxEntries` 支持，不引入额外依赖。

**Step 2: 迁移服务端缓存调用**

将 dashboard/group/availability 的裸 `Map` 缓存收敛到共享工具，保留现有 metrics 输出。

**Step 3: 运行定向验证**

Run: `pnpm lint`
Expected: 无新增 lint 错误

### Task 4: 统一 poller 生命周期

**Files:**
- Modify: `lib/core/poller.ts`
- Modify: `app/api/dashboard/route.ts`
- Modify: `app/api/group/[groupName]/route.ts`
- Modify: `app/api/v1/status/route.ts`

**Step 1: 移除模块导入即启动副作用**

仅保留显式 `ensureBackgroundPollerStarted()` 作为启动入口。

**Step 2: 确认 API 入口均已显式调用**

保证 dashboard、group、status 路由访问时能启动后台轮询。

**Step 3: 运行最终验证**

Run: `pnpm lint`
Expected: PASS

Run: `pnpm build`
Expected: PASS

Run: 手动访问 `/`、`/group/<existing-group>`、`/api/dashboard`
Expected: 页面正常展示，接口结构无回归
