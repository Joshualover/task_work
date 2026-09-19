<template>
  <div class="min-h-full bg-[#FFF7E6] p-4 sm:p-6">
    <div class="mx-auto max-w-2xl">
      <!-- 标题 -->
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-[#1F2329]">零花钱</h1>
          <p class="mt-1 text-sm text-gray-500">
            {{
              mode === 'parent'
                ? '记录零花钱收支，审批孩子的使用申请'
                : '我的零花钱账户'
            }}
          </p>
        </div>
        <Button
          v-if="mode === 'child'"
          size="lg"
          class="rounded-full bg-[#52C41A] text-white shadow-md hover:bg-[#45A91A]"
          @click="openRequestDialog"
        >
          <Plus class="h-5 w-5" />
          申请使用
        </Button>
        <Button
          v-else
          size="lg"
          variant="outline"
          class="rounded-full border-[#36BFFA] text-[#36BFFA] hover:bg-blue-50"
          @click="openAdjustDialog"
        >
          <Pencil class="h-5 w-5" />
          调整余额
        </Button>
      </div>

      <!-- 余额 -->
      <div
        class="mb-4 rounded-2xl p-5 text-white shadow-md"
        style="background: linear-gradient(135deg, #36BFFA 0%, #52C41A 100%)"
      >
        <p class="text-sm text-white/80">
          零花钱余额{{ currentChild ? ` · ${currentChild.name}` : '' }}
        </p>
        <p class="mt-1 text-4xl font-bold">¥{{ fenToYuan(balance) }}</p>
      </div>

      <!-- 家长：待审批 -->
      <div
        v-if="mode === 'parent' && pendingRequests.length > 0"
        class="mb-4 rounded-2xl bg-white p-4 shadow-md"
      >
        <h2 class="mb-3 text-base font-semibold text-[#1F2329]">
          待审批申请（{{ pendingRequests.length }}）
        </h2>
        <div class="space-y-2">
          <div
            v-for="r in pendingRequests"
            :key="r.id"
            class="flex items-center justify-between gap-3 rounded-xl border border-orange-100 p-3"
          >
            <div class="min-w-0">
              <p class="font-semibold text-[#1F2329]">
                ¥{{ fenToYuan(r.amount) }}
                <span v-if="mode === 'parent'" class="ml-1 text-xs font-normal text-gray-400">
                  {{ childName(r.childId) }}
                </span>
              </p>
              <p class="mt-0.5 truncate text-xs text-gray-500">
                用途：{{ r.purpose || '未填写' }} · {{ formatDate(r.createdAt) }}
              </p>
            </div>
            <div class="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                class="rounded-full border-[#FF4D4F] text-[#FF4D4F] hover:bg-red-50"
                :disabled="actionLoading === r.id"
                @click="handleReview(r, false)"
              >
                拒绝
              </Button>
              <Button
                size="sm"
                class="rounded-full bg-[#52C41A] text-white hover:bg-[#45A91A]"
                :disabled="actionLoading === r.id"
                @click="handleReview(r, true)"
              >
                通过
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab -->
      <div class="mb-4 flex gap-2">
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          class="rounded-full px-4 py-2 text-sm font-medium transition-all"
          :class="
            tab === t.key
              ? 'bg-[#FF8A3D] text-white shadow-md'
              : 'bg-white text-gray-600 hover:bg-orange-50'
          "
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- 账单 -->
      <div v-if="tab === 'ledger'" class="rounded-2xl bg-white p-4 shadow-md">
        <div v-if="loading" class="py-12 text-center text-gray-400">加载中...</div>
        <div
          v-else-if="transactions.length === 0"
          class="py-12 text-center text-gray-400"
        >
          暂无零花钱记录
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="t in transactions"
            :key="t.id"
            class="flex items-center justify-between border-b border-gray-100 py-3 last:border-b-0"
          >
            <div class="flex items-center gap-3">
              <div
                :class="[
                  'flex h-10 w-10 items-center justify-center rounded-full',
                  t.changeAmount > 0 ? 'bg-green-50' : 'bg-red-50',
                ]"
              >
                <TrendingUp
                  v-if="t.changeAmount > 0"
                  class="h-5 w-5 text-[#52C41A]"
                />
                <TrendingDown v-else class="h-5 w-5 text-[#FF4D4F]" />
              </div>
              <div class="min-w-0">
                <p class="truncate font-medium text-[#1F2329]">
                  {{ t.reason || (t.changeAmount > 0 ? '零花钱收入' : '零花钱使用') }}
                </p>
                <p class="text-xs text-gray-500">
                  {{ formatDate(t.createdAt) }}
                  <span v-if="mode === 'parent'" class="ml-1">
                    · {{ childName(t.childId) }}
                  </span>
                </p>
              </div>
            </div>
            <div class="text-right">
              <p
                :class="[
                  'text-lg font-bold',
                  t.changeAmount > 0 ? 'text-[#52C41A]' : 'text-[#FF4D4F]',
                ]"
              >
                {{ t.changeAmount > 0 ? '+' : '-' }}¥{{ fenToYuan(Math.abs(t.changeAmount)) }}
              </p>
              <p class="text-xs text-gray-500">余额 ¥{{ fenToYuan(t.balanceAfter) }}</p>
            </div>
          </div>
        </div>

        <div
          v-if="totalPages > 1"
          class="mt-4 flex items-center justify-center gap-2 border-t border-gray-100 pt-4"
        >
          <Button
            variant="outline"
            size="sm"
            class="rounded-full"
            :disabled="page === 1"
            @click="prevPage"
          >
            <ChevronLeft class="h-4 w-4" />
          </Button>
          <span class="text-sm text-gray-500">第 {{ page }} / {{ totalPages }} 页</span>
          <Button
            variant="outline"
            size="sm"
            class="rounded-full"
            :disabled="page === totalPages"
            @click="nextPage"
          >
            <ChevronRight class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <!-- 申请记录 -->
      <div v-else class="rounded-2xl bg-white p-4 shadow-md">
        <div v-if="requests.length === 0" class="py-12 text-center text-gray-400">
          暂无申请记录
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="r in requests"
            :key="r.id"
            class="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3"
          >
            <div class="min-w-0">
              <p class="font-semibold text-[#1F2329]">¥{{ fenToYuan(r.amount) }}</p>
              <p class="mt-0.5 truncate text-xs text-gray-500">
                {{ r.purpose || '未填写用途' }} · {{ formatDate(r.createdAt) }}
                <span v-if="mode === 'parent'"> · {{ childName(r.childId) }}</span>
              </p>
              <p v-if="r.reviewNote" class="mt-0.5 text-xs text-gray-400">
                审批备注：{{ r.reviewNote }}
              </p>
            </div>
            <span
              class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium"
              :class="STATUS_STYLE[r.status].cls"
            >
              {{ STATUS_STYLE[r.status].label }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 申请使用弹窗 -->
    <Dialog v-model:model-value="requestDialogOpen" title="申请使用零花钱">
      <div class="space-y-4">
        <p class="text-sm text-gray-500">
          当前余额 ¥{{ fenToYuan(balance) }}，申请后需家长审批通过才会扣减。
        </p>
        <div class="space-y-2">
          <Label class="text-sm font-medium text-[#1F2329]">金额（元）</Label>
          <Input
            type="number"
            placeholder="如：5"
            v-model:value="requestForm.amount"
            class="rounded-xl"
          />
        </div>
        <div class="space-y-2">
          <Label class="text-sm font-medium text-[#1F2329]">用途</Label>
          <Input
            placeholder="如：买文具"
            v-model:value="requestForm.purpose"
            class="rounded-xl"
          />
        </div>
      </div>
      <template #footer>
        <Button
          variant="outline"
          class="rounded-full"
          :disabled="requestSubmitting"
          @click="requestDialogOpen = false"
        >
          取消
        </Button>
        <Button
          class="rounded-full bg-[#52C41A] text-white hover:bg-[#45A91A]"
          :disabled="requestSubmitting"
          @click="void handleSubmitRequest()"
        >
          {{ requestSubmitting ? '提交中...' : '提交申请' }}
        </Button>
      </template>
    </Dialog>
    <!-- 调整余额弹窗（家长） -->
    <Dialog
      v-model:model-value="adjustDialogOpen"
      title="调整零花钱余额"
      max-width-class="sm:max-w-sm"
    >
      <div class="space-y-4">
        <p class="text-sm text-gray-500">
          当前余额 ¥{{ fenToYuan(balance) }}。可直接填入实际余额（例如原有的零花钱），
          差额会记入账单。
        </p>
        <div class="space-y-2">
          <Label class="text-sm font-medium text-[#1F2329]">调整后余额（元）</Label>
          <Input
            type="number"
            placeholder="如：100"
            v-model:value="adjustForm.balance"
            class="rounded-xl"
          />
        </div>
        <div class="space-y-2">
          <Label class="text-sm font-medium text-[#1F2329]">原因</Label>
          <Input
            placeholder="如：期初余额 / 纠错"
            v-model:value="adjustForm.reason"
            class="rounded-xl"
          />
        </div>
        <p
          v-if="adjustDelta !== 0"
          class="text-xs font-medium"
          :class="adjustDelta > 0 ? 'text-[#52C41A]' : 'text-[#FF4D4F]'"
        >
          将{{ adjustDelta > 0 ? '增加' : '减少' }} ¥{{ fenToYuan(Math.abs(adjustDelta)) }}
        </p>
      </div>
      <template #footer>
        <Button
          variant="outline"
          class="rounded-full"
          :disabled="adjustSubmitting"
          @click="adjustDialogOpen = false"
        >
          取消
        </Button>
        <Button
          class="rounded-full bg-[#36BFFA] text-white hover:bg-[#2AA9E0]"
          :disabled="adjustSubmitting || adjustDelta === 0"
          @click="void handleAdjust()"
        >
          {{ adjustSubmitting ? '提交中...' : '确认调整' }}
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  Plus,
  Pencil,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-vue-next';
import { logger } from '@lark-apaas/client-toolkit/logger';

import Button from '@/components/ui/Button.vue';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/utils/error';
import { fenToYuan, yuanToFen } from '@/utils/money';
import { allowanceApi } from '@/api';
import { useChildStore } from '@/stores/child';
import type {
  AllowanceRequest,
  AllowanceRequestStatus,
  AllowanceTransaction,
} from '@shared/api.interface';

const props = withDefaults(
  defineProps<{ mode?: 'parent' | 'child' }>(),
  { mode: 'parent' },
);

const TABS = [
  { key: 'ledger' as const, label: '账单' },
  { key: 'requests' as const, label: '申请记录' },
];

const STATUS_STYLE: Record<AllowanceRequestStatus, { label: string; cls: string }> = {
  pending: { label: '待审批', cls: 'bg-orange-50 text-[#FF8A3D]' },
  approved: { label: '已通过', cls: 'bg-green-50 text-[#52C41A]' },
  rejected: { label: '已拒绝', cls: 'bg-red-50 text-[#FF4D4F]' },
};

const childStore = useChildStore();
const currentChild = computed(() => childStore.currentChild);
const childId = computed(() => currentChild.value?.id ?? '');

const tab = ref<'ledger' | 'requests'>('ledger');
const balance = ref<number>(0);
const transactions = ref<AllowanceTransaction[]>([]);
const requests = ref<AllowanceRequest[]>([]);
const total = ref<number>(0);
const page = ref<number>(1);
const pageSize = ref<number>(20);
const loading = ref<boolean>(false);
const actionLoading = ref<string | null>(null);

const requestDialogOpen = ref<boolean>(false);
const requestSubmitting = ref<boolean>(false);
const requestForm = reactive({ amount: '', purpose: '' });

const adjustDialogOpen = ref<boolean>(false);
const adjustSubmitting = ref<boolean>(false);
const adjustForm = reactive({ balance: '', reason: '' });

/** 目标余额与当前余额的差额（分） */
const adjustDelta = computed(() => yuanToFen(adjustForm.balance) - balance.value);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const pendingRequests = computed(() =>
  requests.value.filter((r) => r.status === 'pending'),
);

function childName(id: string): string {
  return childStore.children.find((c) => c.id === id)?.name ?? '';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function fetchAll(): Promise<void> {
  if (props.mode === 'child' && !childId.value) return;
  loading.value = true;
  try {
    // 家长看整个家庭，孩子只看自己
    const queryChildId = props.mode === 'child' ? childId.value : undefined;
    const [balanceRes, txRes, reqRes] = await Promise.all([
      childId.value
        ? allowanceApi.getBalance(childId.value)
        : Promise.resolve({ balance: 0 }),
      allowanceApi.listTransactions({
        childId: childId.value,
        page: page.value,
        pageSize: pageSize.value,
      }),
      allowanceApi.listRequests({ childId: queryChildId }),
    ]);
    balance.value = balanceRes.balance;
    transactions.value = txRes.items;
    total.value = txRes.total;
    requests.value = reqRes.items;
  } catch (error) {
    logger.error('获取零花钱数据失败', error);
  } finally {
    loading.value = false;
  }
}

function openRequestDialog(): void {
  requestForm.amount = '';
  requestForm.purpose = '';
  requestDialogOpen.value = true;
}

function openAdjustDialog(): void {
  adjustForm.balance = fenToYuan(balance.value);
  adjustForm.reason = '余额调整';
  adjustDialogOpen.value = true;
}

async function handleAdjust(): Promise<void> {
  const delta = adjustDelta.value;
  if (delta === 0) return;
  if (!adjustForm.reason.trim()) {
    toast.error('请填写调整原因');
    return;
  }
  adjustSubmitting.value = true;
  try {
    await allowanceApi.adjustBalance({
      childId: childId.value,
      changeAmount: delta,
      reason: adjustForm.reason.trim(),
    });
    toast.success('余额已调整');
    adjustDialogOpen.value = false;
    await fetchAll();
  } catch (error) {
    logger.error('调整零花钱失败', error);
    toast.error(getErrorMessage(error, '调整失败，请重试'));
  } finally {
    adjustSubmitting.value = false;
  }
}

async function handleSubmitRequest(): Promise<void> {
  const amount = yuanToFen(requestForm.amount);
  if (amount <= 0) {
    toast.error('请输入正确的金额');
    return;
  }
  requestSubmitting.value = true;
  try {
    await allowanceApi.createRequest({
      childId: childId.value,
      amount,
      purpose: requestForm.purpose.trim() || undefined,
    });
    toast.success('申请已提交，等待家长审批');
    requestDialogOpen.value = false;
    await fetchAll();
    tab.value = 'requests';
  } catch (error) {
    logger.error('提交零花钱申请失败', error);
    toast.error(getErrorMessage(error, '提交失败，请重试'));
  } finally {
    requestSubmitting.value = false;
  }
}

async function handleReview(
  r: AllowanceRequest,
  approved: boolean,
): Promise<void> {
  actionLoading.value = r.id;
  try {
    await allowanceApi.reviewRequest(r.id, { approved });
    toast.success(approved ? '已通过' : '已拒绝');
    await fetchAll();
  } catch (error) {
    logger.error('审批零花钱申请失败', error);
    toast.error(getErrorMessage(error, '操作失败，请重试'));
  } finally {
    actionLoading.value = null;
  }
}

function prevPage(): void {
  page.value = Math.max(1, page.value - 1);
  void fetchAll();
}

function nextPage(): void {
  page.value = Math.min(totalPages.value, page.value + 1);
  void fetchAll();
}

onMounted(() => {
  void fetchAll();
});

watch([childId, () => props.mode], () => {
  page.value = 1;
  void fetchAll();
});
</script>
