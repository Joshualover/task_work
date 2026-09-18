<template>
  <div class="min-h-full bg-[#FFF7E6] p-6">
    <!-- 页面标题 -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-[#1F2329]">
        {{ mode === 'parent' ? '兑换审核' : '我的兑换' }}
      </h1>
      <p class="mt-1 text-sm text-gray-500">
        {{ mode === 'parent' ? '审核孩子提交的奖励兑换申请' : '查看兑换申请记录' }}
      </p>
    </div>

    <!-- Tab 切换 -->
    <div class="mb-4 flex gap-2">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="activeTab = tab.key"
        :class="[
          'flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all',
          activeTab === tab.key
            ? 'bg-[#FF8A3D] text-white shadow-md'
            : 'bg-white text-gray-600 hover:bg-orange-50',
        ]"
      >
        <component :is="tab.icon" class="h-4 w-4" />
        {{ tab.label }}
      </button>
    </div>

    <!-- 兑换列表 -->
    <div class="rounded-2xl bg-white p-4 shadow-md">
      <div v-if="loading" class="py-12 text-center text-gray-400">加载中...</div>
      <div v-else-if="redemptions.length === 0" class="py-12 text-center">
        <Gift class="mx-auto mb-3 h-12 w-12 text-gray-300" />
        <p class="text-gray-400">暂无兑换记录</p>
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="item in redemptions"
          :key="item.id"
          class="flex items-center justify-between rounded-xl border border-gray-100 p-4 transition-colors hover:bg-orange-50/30"
        >
          <div class="flex items-center gap-4">
            <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50">
              <Gift class="h-6 w-6 text-[#FF8A3D]" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-semibold text-[#1F2329]">
                  {{ item.rewardName }}
                </h3>
                <span
                  :class="[
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                    statusBadgeClass(item.status),
                  ]"
                >
                  <component :is="statusIcon(item.status)" class="h-3 w-3" />
                  {{ statusLabel(item.status) }}
                </span>
              </div>
              <div class="mt-1 flex items-center gap-3 text-sm text-gray-500">
                <span class="flex items-center gap-1">
                  <Coins class="h-3.5 w-3.5 text-[#FF8A3D]" />
                  {{ item.pointsCost }} 积分
                </span>
                <span class="text-xs">
                  申请时间：{{ formatDate(item.createdAt) }}
                </span>
                <span v-if="item.reviewedAt" class="text-xs">
                  审核时间：{{ formatDate(item.reviewedAt) }}
                </span>
              </div>
              <div v-if="item.reviewNote" class="mt-1.5 flex items-start gap-1 text-xs text-gray-500">
                <MessageSquare class="mt-0.5 h-3 w-3 flex-shrink-0" />
                <span>审核备注：{{ item.reviewNote }}</span>
              </div>
            </div>
          </div>

          <div v-if="mode === 'parent' && item.status === 'pending'" class="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              class="rounded-full border-[#FF4D4F] text-[#FF4D4F] hover:bg-red-50"
              @click="openRejectDialog(item)"
              :disabled="actionLoading === item.id"
            >
              <XCircle class="h-4 w-4" />
              拒绝
            </Button>
            <Button
              size="sm"
              class="rounded-full"
              style="background-color: #52C41A"
              @click="handleApprove(item)"
              :disabled="actionLoading === item.id"
            >
              <CheckCircle class="h-4 w-4" />
              通过
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 拒绝原因弹窗 -->
    <Dialog v-model:model-value="rejectDialogOpen" title="拒绝兑换">
      <div v-if="rejectRedemption" class="space-y-4">
        <p class="text-sm text-gray-600">
          拒绝兑换「<span class="font-semibold">{{ rejectRedemption.rewardName }}</span>」的申请
        </p>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">
            拒绝原因（可选）
          </label>
          <Input
            v-model:value="rejectNote"
            placeholder="请输入拒绝原因"
          />
        </div>
        <p class="text-xs text-gray-500">
          拒绝后，{{ rejectRedemption.pointsCost }} 积分将退回到孩子账户。
        </p>
      </div>
      <template #footer>
        <Button
          variant="outline"
          @click="rejectDialogOpen = false"
          class="rounded-full"
        >
          取消
        </Button>
        <Button
          class="rounded-full"
          style="background-color: #FF4D4F"
          @click="handleReject"
          :disabled="actionLoading === rejectRedemption?.id"
        >
          {{ actionLoading === rejectRedemption?.id ? '提交中...' : '确认拒绝' }}
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  Clock,
  CheckCircle,
  XCircle,
  Gift,
  Coins,
  MessageSquare,
} from 'lucide-vue-next';

import Button from '@/components/ui/Button.vue';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import { redemptionApi } from '@/api';
import { useChildStore } from '@/stores/child';
import type { Redemption, RedemptionStatus } from '@shared/api.interface';

interface Props {
  mode?: 'parent' | 'child';
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'parent',
});

const childStore = useChildStore();

const redemptions = ref<Redemption[]>([]);
const loading = ref<boolean>(false);
const activeTab = ref<RedemptionStatus | 'all'>('pending');
const rejectDialogOpen = ref<boolean>(false);
const rejectRedemption = ref<Redemption | null>(null);
const rejectNote = ref<string>('');
const actionLoading = ref<string | null>(null);

const tabs = computed(() => [
  { key: 'pending' as const, label: '待审核', icon: Clock, color: 'text-[#FF8A3D]' },
  { key: 'approved' as const, label: '已通过', icon: CheckCircle, color: 'text-[#52C41A]' },
  { key: 'rejected' as const, label: '已拒绝', icon: XCircle, color: 'text-[#FF4D4F]' },
]);

async function fetchRedemptions(): Promise<void> {
  loading.value = true;
  try {
    const params: { childId?: string; status?: RedemptionStatus } = {};
    if (props.mode === 'child' && childStore.currentChild?.id) {
      params.childId = childStore.currentChild.id;
    }
    if (activeTab.value !== 'all') {
      params.status = activeTab.value;
    }
    const result = await redemptionApi.listRedemptions(params);
    redemptions.value = result.items;
  } catch (error) {
    logger.error('获取兑换列表失败', error as Error);
  } finally {
    loading.value = false;
  }
}

async function handleApprove(redemption: Redemption): Promise<void> {
  actionLoading.value = redemption.id;
  try {
    await redemptionApi.reviewRedemption(redemption.id, {
      approved: true,
    });
    await fetchRedemptions();
  } catch (error) {
    logger.error('审核通过失败', error as Error);
  } finally {
    actionLoading.value = null;
  }
}

function openRejectDialog(redemption: Redemption): void {
  rejectRedemption.value = redemption;
  rejectNote.value = '';
  rejectDialogOpen.value = true;
}

async function handleReject(): Promise<void> {
  if (!rejectRedemption.value) return;
  actionLoading.value = rejectRedemption.value.id;
  try {
    await redemptionApi.reviewRedemption(rejectRedemption.value.id, {
      approved: false,
      reviewNote: rejectNote.value.trim() || undefined,
    });
    rejectDialogOpen.value = false;
    rejectRedemption.value = null;
    rejectNote.value = '';
    await fetchRedemptions();
  } catch (error) {
    logger.error('审核拒绝失败', error as Error);
  } finally {
    actionLoading.value = null;
  }
}

function statusBadgeClass(status: RedemptionStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-orange-50 text-[#FF8A3D]';
    case 'approved':
      return 'bg-green-50 text-[#52C41A]';
    case 'rejected':
      return 'bg-red-50 text-[#FF4D4F]';
    default:
      return 'bg-gray-50 text-gray-500';
  }
}

function statusLabel(status: RedemptionStatus): string {
  switch (status) {
    case 'pending':
      return '待审核';
    case 'approved':
      return '已通过';
    case 'rejected':
      return '已拒绝';
    default:
      return status;
  }
}

function statusIcon(status: RedemptionStatus): typeof Clock {
  switch (status) {
    case 'pending':
      return Clock;
    case 'approved':
      return CheckCircle;
    case 'rejected':
      return XCircle;
    default:
      return Clock;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

watch(activeTab, () => {
  void fetchRedemptions();
});

watch(
  () => childStore.currentChild?.id,
  () => {
    if (props.mode === 'child') {
      void fetchRedemptions();
    }
  },
);

onMounted(() => {
  void fetchRedemptions();
});
</script>
