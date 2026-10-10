import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  AuthStartRequest,
  AuthStartResponse,
  ContentListResponse,
  CreateAccountRequest,
  CreateContentRequest,
  CreateMaterialRequest,
  DataOverviewResponse,
  DataSyncResponse,
  MaterialGroup,
  MaterialItem,
  MaterialListResponse,
  MaterialBatchDeleteRequest,
  MaterialBatchMoveRequest,
  MetricBatchResponse,
  MetricInput,
  MetricsSummaryResponse,
  SocialAccount,
  SocialContent,
  SocialContentDetail,
  SocialPost,
  SaveVariantsRequest,
  UpdateAccountRequest,
  UpdateContentRequest,
  UpdateMaterialRequest,
  MaterialUsageResponse,
} from '@shared/api.interface';

export async function listAccounts(params?: {
  platform?: string;
  group?: string;
  status?: string;
}): Promise<SocialAccount[]> {
  const response = await axiosForBackend({
    url: '/api/social/accounts',
    method: 'GET',
    params,
  });
  return response.data;
}

/** 校验单个账号登录态（cookie 是否过期 + 重新提取用户信息），返回更新后的账号 */
export async function verifyAccount(id: string): Promise<SocialAccount> {
  const response = await axiosForBackend({
    url: `/api/social/accounts/verify/${id}`,
    method: 'GET',
  });
  return response.data;
}

/** 发起平台 OAuth 授权，返回授权页地址 */
export async function startAuth(
  data: AuthStartRequest,
): Promise<AuthStartResponse> {
  const response = await axiosForBackend({
    url: '/api/social/auth/start',
    method: 'POST',
    data,
  });
  return response.data;
}

/** 浏览器授权（个人号）：拉起本机 Edge 登录窗口 */
export async function startBrowserAuth(data: {
  platform: string;
  /** 从原账号卡片发起重授权时传入，授权成功后刷新该账号而非新建 */
  accountId?: string;
}): Promise<{ ok: boolean; message?: string }> {
  const response = await axiosForBackend({
    url: '/api/social/auth/browser/start',
    method: 'POST',
    data,
  });
  return response.data;
}

/** 浏览器授权状态轮询 */
export async function getBrowserAuthStatus(): Promise<{
  status: 'idle' | 'pending' | 'success' | 'failed';
  accountName?: string;
  message?: string;
}> {
  const response = await axiosForBackend({
    url: '/api/social/auth/browser/status',
    method: 'GET',
  });
  return response.data;
}

export async function createAccount(
  data: CreateAccountRequest,
): Promise<SocialAccount> {
  const response = await axiosForBackend({
    url: '/api/social/accounts',
    method: 'POST',
    data,
  });
  return response.data;
}

export async function updateAccount(
  id: string,
  data: UpdateAccountRequest,
): Promise<SocialAccount> {
  const response = await axiosForBackend({
    url: `/api/social/accounts/${id}`,
    method: 'PATCH',
    data,
  });
  return response.data;
}

export async function deleteAccount(id: string): Promise<void> {
  await axiosForBackend({
    url: `/api/social/accounts/${id}`,
    method: 'DELETE',
  });
}

export async function listContents(params?: {
  status?: string;
  contentType?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<ContentListResponse> {
  const response = await axiosForBackend({
    url: '/api/social/contents',
    method: 'GET',
    params,
  });
  return response.data;
}

export async function getContent(id: string): Promise<SocialContentDetail> {
  const response = await axiosForBackend({
    url: `/api/social/contents/${id}`,
    method: 'GET',
  });
  return response.data;
}

export async function createContent(
  data: CreateContentRequest,
): Promise<SocialContent> {
  const response = await axiosForBackend({
    url: '/api/social/contents',
    method: 'POST',
    data,
  });
  return response.data;
}

export async function updateContent(
  id: string,
  data: UpdateContentRequest,
): Promise<SocialContent> {
  const response = await axiosForBackend({
    url: `/api/social/contents/${id}`,
    method: 'PATCH',
    data,
  });
  return response.data;
}

export async function deleteContent(id: string): Promise<void> {
  await axiosForBackend({
    url: `/api/social/contents/${id}`,
    method: 'DELETE',
  });
}

export async function saveVariants(
  contentId: string,
  data: SaveVariantsRequest,
): Promise<void> {
  await axiosForBackend({
    url: `/api/social/contents/${contentId}/variants`,
    method: 'PUT',
    data,
  });
}

export async function createMetric(data: MetricInput): Promise<void> {
  await axiosForBackend({
    url: '/api/social/metrics',
    method: 'POST',
    data,
  });
}

export async function importMetrics(
  data: MetricInput[],
): Promise<MetricBatchResponse> {
  const response = await axiosForBackend({
    url: '/api/social/metrics/batch',
    method: 'POST',
    data: { items: data },
  });
  return response.data;
}

export async function getMetricsSummary(
  start: string,
  end: string,
): Promise<MetricsSummaryResponse> {
  const response = await axiosForBackend({
    url: '/api/social/metrics/summary',
    method: 'GET',
    params: { start, end },
  });
  return response.data;
}

export async function listMaterials(params?: {
  type?: string;
  group?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<MaterialListResponse> {
  const response = await axiosForBackend({
    url: '/api/social/materials',
    method: 'GET',
    params,
  });
  return response.data;
}

export async function listMaterialGroups(): Promise<MaterialGroup[]> {
  const response = await axiosForBackend({
    url: '/api/social/materials/groups',
    method: 'GET',
  });
  return response.data;
}

export async function createMaterial(
  data: CreateMaterialRequest,
): Promise<MaterialItem> {
  const response = await axiosForBackend({
    url: '/api/social/materials',
    method: 'POST',
    data,
  });
  return response.data;
}

export async function updateMaterial(
  id: string,
  data: UpdateMaterialRequest,
): Promise<MaterialItem> {
  const response = await axiosForBackend({
    url: `/api/social/materials/${id}`,
    method: 'PATCH',
    data,
  });
  return response.data;
}

export async function deleteMaterial(id: string): Promise<void> {
  await axiosForBackend({
    url: `/api/social/materials/${id}`,
    method: 'DELETE',
  });
}

export async function batchDeleteMaterials(
  data: MaterialBatchDeleteRequest,
): Promise<void> {
  await axiosForBackend({
    url: '/api/social/materials/batch-delete',
    method: 'POST',
    data,
  });
}

export async function batchMoveMaterials(
  data: MaterialBatchMoveRequest,
): Promise<void> {
  await axiosForBackend({
    url: '/api/social/materials/batch-move',
    method: 'POST',
    data,
  });
}

export async function createMaterialGroup(name: string): Promise<void> {
  await axiosForBackend({
    url: '/api/social/materials/groups',
    method: 'POST',
    data: { name },
  });
}

export async function renameMaterialGroup(
  oldName: string,
  newName: string,
): Promise<void> {
  await axiosForBackend({
    url: `/api/social/materials/groups/${encodeURIComponent(oldName)}`,
    method: 'PATCH',
    data: { name: newName },
  });
}

export async function deleteMaterialGroup(name: string): Promise<void> {
  await axiosForBackend({
    url: `/api/social/materials/groups/${encodeURIComponent(name)}`,
    method: 'DELETE',
  });
}

export async function getMaterialUsage(): Promise<MaterialUsageResponse> {
  const response = await axiosForBackend({
    url: '/api/social/materials/usage',
    method: 'GET',
  });
  return response.data;
}

/** 桌面端 WebView2 缓存信息（目录 + 占用大小） */
export async function getCacheInfo(): Promise<{ dir: string; sizeMB: number }> {
  const response = await axiosForBackend({
    url: '/api/social/app/cache-info',
    method: 'GET',
  });
  return response.data;
}

/** 清理桌面端 WebView2 缓存（可删即删，被进程占用的下次启动清除） */
export async function clearAppCache(): Promise<{
  clearedMB: number;
  removedItems: number;
  failedItems: number;
}> {
  const response = await axiosForBackend({
    url: '/api/social/app/clear-cache',
    method: 'POST',
  });
  return response.data;
}

/** 在系统资源管理器中打开缓存目录 */
export async function openCacheDir(): Promise<{ ok: boolean }> {
  const response = await axiosForBackend({
    url: '/api/social/app/open-cache-dir',
    method: 'POST',
  });
  return response.data;
}

/** 数据总览：6 KPI 聚合 + 平台/账号分布（可选按账号筛选） */
export async function getDataOverview(
  accountId?: string,
): Promise<DataOverviewResponse> {
  const response = await axiosForBackend({
    url: '/api/social/data/overview',
    method: 'GET',
    params: accountId ? { accountId } : undefined,
  });
  return response.data;
}

/** 账号作品列表 */
export async function getDataPosts(accountId: string): Promise<SocialPost[]> {
  const response = await axiosForBackend({
    url: '/api/social/data/posts',
    method: 'GET',
    params: { accountId },
  });
  return response.data;
}

/** 触发数据同步（异步执行，默认全部账号） */
export async function syncData(
  accountId?: string,
): Promise<DataSyncResponse> {
  const response = await axiosForBackend({
    url: '/api/social/data/sync',
    method: 'POST',
    params: accountId ? { accountId } : undefined,
  });
  return response.data;
}
