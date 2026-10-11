import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  AccountBatchMoveRequest,
  AccountGroup,
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
  TopicGroup,
  TopicLibrary,
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

/** 账号分组列表 */
export async function listAccountGroups(): Promise<AccountGroup[]> {
  const response = await axiosForBackend({
    url: '/api/social/accounts/groups',
    method: 'GET',
  });
  return response.data;
}

/* ---------- 常用话题库（发布页） ---------- */

/** 话题库全量（分组 + 组内标签） */
export async function listTopicLibrary(): Promise<TopicLibrary> {
  const response = await axiosForBackend({
    url: '/api/social/topics',
    method: 'GET',
  });
  return response.data;
}

/** 新建话题分组 */
export async function createTopicGroup(name: string): Promise<TopicGroup> {
  const response = await axiosForBackend({
    url: '/api/social/topics/groups',
    method: 'POST',
    data: { name },
  });
  return response.data;
}

/** 重命名话题分组 */
export async function renameTopicGroup(id: string, name: string): Promise<void> {
  await axiosForBackend({
    url: `/api/social/topics/groups/${id}`,
    method: 'PATCH',
    data: { name },
  });
}

/** 删除话题分组（组内标签级联删除） */
export async function deleteTopicGroup(id: string): Promise<void> {
  await axiosForBackend({
    url: `/api/social/topics/groups/${id}`,
    method: 'DELETE',
  });
}

/** 分组内批量添加话题 */
export async function addTopicTags(groupId: string, names: string[]): Promise<void> {
  await axiosForBackend({
    url: `/api/social/topics/groups/${groupId}/tags`,
    method: 'POST',
    data: { names },
  });
}

/** 删除单个话题 */
export async function deleteTopicTag(id: string): Promise<void> {
  await axiosForBackend({
    url: `/api/social/topics/tags/${id}`,
    method: 'DELETE',
  });
}

/** 新建账号分组 */
export async function createAccountGroup(name: string): Promise<void> {
  await axiosForBackend({
    url: '/api/social/accounts/groups',
    method: 'POST',
    data: { name },
  });
}

/** 重命名账号分组 */
export async function renameAccountGroup(
  oldName: string,
  newName: string,
): Promise<void> {
  await axiosForBackend({
    url: `/api/social/accounts/groups/${encodeURIComponent(oldName)}`,
    method: 'PATCH',
    data: { name: newName },
  });
}

/** 删除账号分组（分组下账号移到未分组） */
export async function deleteAccountGroup(name: string): Promise<void> {
  await axiosForBackend({
    url: `/api/social/accounts/groups/${encodeURIComponent(name)}`,
    method: 'DELETE',
  });
}

/** 批量移动账号到分组 */
export async function batchMoveAccounts(
  data: AccountBatchMoveRequest,
): Promise<void> {
  await axiosForBackend({
    url: '/api/social/accounts/batch-move',
    method: 'POST',
    data,
  });
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

/* ------------------------------------------------------------------ */
/* 发布：任务 CRUD + 提交 + 文件上传                                    */
/* ------------------------------------------------------------------ */

import type {
  FileUploadResponse,
  PublishTask,
  PublishTaskInput,
} from '@shared/api.interface';

export async function listPublishTasks(params?: {
  status?: string;
  publishType?: string;
}): Promise<PublishTask[]> {
  const response = await axiosForBackend({
    url: '/api/social/publish/tasks',
    method: 'GET',
    params,
  });
  return response.data;
}

export async function getPublishTask(id: string): Promise<PublishTask> {
  const response = await axiosForBackend({
    url: `/api/social/publish/tasks/${id}`,
    method: 'GET',
  });
  return response.data;
}

export async function createPublishTask(
  data: PublishTaskInput,
): Promise<PublishTask> {
  const response = await axiosForBackend({
    url: '/api/social/publish/tasks',
    method: 'POST',
    data,
  });
  return response.data;
}

export async function updatePublishTask(
  id: string,
  data: PublishTaskInput,
): Promise<PublishTask> {
  const response = await axiosForBackend({
    url: `/api/social/publish/tasks/${id}`,
    method: 'PATCH',
    data,
  });
  return response.data;
}

export async function deletePublishTask(id: string): Promise<void> {
  await axiosForBackend({
    url: `/api/social/publish/tasks/${id}`,
    method: 'DELETE',
  });
}

export async function submitPublishTask(
  id: string,
  body: { asDraft?: boolean; scheduledAt?: string | null },
): Promise<PublishTask> {
  const response = await axiosForBackend({
    url: `/api/social/publish/tasks/${id}/submit`,
    method: 'POST',
    data: body,
  });
  return response.data;
}

/** 统一文件上传（发布临时桶 publish-tmp；素材库后续用 materials） */
export async function uploadPublishFile(
  file: File,
  bucket: 'publish-tmp' | 'materials' = 'publish-tmp',
  onProgress?: (percent: number) => void,
  thumb?: File | null,
): Promise<FileUploadResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('bucket', bucket);
  if (thumb) form.append('thumb', thumb);
  const response = await axiosForBackend({
    url: '/api/social/files/upload',
    method: 'POST',
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000, // 浏览器→本机后端传输；MinIO 存储进度由后台任务轮询
  });
  const data = response.data as FileUploadResponse;
  // S3 模式：返回 taskId，轮询后台任务拿 MinIO 服务器侧真实进度
  if (data.taskId) {
    return await pollUploadTask(data.taskId, onProgress);
  }
  return data;
}

/** 轮询 S3 上传任务直到完成，回报真实进度 */
async function pollUploadTask(
  taskId: string,
  onProgress?: (percent: number) => void,
): Promise<FileUploadResponse> {
  for (;;) {
    const resp = await axiosForBackend({
      url: `/api/social/files/upload-progress/${taskId}`,
      method: 'GET',
      timeout: 10000,
    });
    const task = resp.data as {
      taskId: string;
      percent: number;
      phase: 'uploading' | 'done' | 'error';
      fileKey?: string;
      url?: string;
      thumbUrl?: string | null;
      error?: string;
    };
    if (onProgress) onProgress(task.percent ?? 0);
    if (task.phase === 'done') {
      return {
        fileKey: task.fileKey ?? '',
        url: task.url ?? '',
        size: 0,
        mime: '',
        thumbUrl: task.thumbUrl ?? null,
      };
    }
    if (task.phase === 'error') {
      throw new Error(task.error ?? '上传失败');
    }
    // 500ms 轮询一次
    await new Promise((resolve: (v: void) => void): void => {
      setTimeout(resolve, 500);
    });
  }
}
