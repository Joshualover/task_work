<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  Coins, Plus, ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
} from 'lucide-vue-next';
import Button from '@/components/ui/Button.vue';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import { pointApi } from '@/api';
import { useChildStore } from '@/stores/child';
import type { PointTransaction } from '@shared/api.interface';

const props = withDefaults(defineProps<{
  mode?: 'parent' | 'child';
}>(), {
  mode: 'parent',
});

const childStore = useChildStore();
const currentChild = computed(() => childStore.currentChild);
const childId = computed(() => currentChild.value?.id ?? '');
const childName = computed(() => currentChild.value?.name ?? '孩子');

const balance = ref<number>(0);
const transactions = ref<PointTransaction[]>([]);
const total = ref<number>(0);
const page = ref<number>(1);
const pageSize = ref<number>(20);
const loading = ref<boolean>(false);
const adjustDialogOpen = ref<boolean>(false);
const adjustAmount = ref<string>('');
const adjustReason = ref<string>('');
const submitting = ref<boolean>(false);

const fetchBalance = async () => {
  if (!childId.value) return;
  try {
    const result = await pointApi.getBalance(childId.value);
    balance.value = result.balance;
  } catch (error) {
    logger.error('获取积分余额失败', error);
  }
};

const fetchTransactions = async () => {
  if (!childId.value) return;
  loading.value = true;
  try {
    const result = await pointApi.listTransactions({
      childId: childId.value,
      page: page.value,
      pageSize: pageSize.value,
    });
    transactions.value = result.items;
    total.value = result.total;
  } catch (error) {
    logger.error('获取积分流水失败', error);
  } finally {
    loading.value = false;
  }
};

const fetchAll = async () => {
  await Promise.all([fetchBalance(), fetchTransactions()]);
};

onMounted(() => {
  void fetchAll();
});

watch(childId, () => {
  page.value = 1;
  void fetchAll();
});

const handleAdjust = async () => {
  const amount = parseInt(adjustAmount.value, 10);
  if (isNaN(amount) || amount === 0) {
    return;
  }
  if (!adjustReason.value.trim()) {
    return;
  }

  submitting.value = true;
  try {
    await pointApi.adjustPoints({
      childId: childId.value,
      changeAmount: amount,
      reason: adjustReason.value.trim(),
    });
    adjustDialogOpen.value = false;
    adjustAmount.value = '';
    adjustReason.value = '';
    await fetchAll();
  } catch (error) {
    logger.error('调整积分失败', error);
  } finally {
    submitting.value = false;
  }
};

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

const formatTypeLabel = (type: PointTransaction['type']): string => {
  const labelMap: Record<PointTransaction['type'], string> = {
    earn: '赚取',
    spend: '消费',
    adjust_add: '补发',
    adjust_sub: '扣回',
    refund: '退款',
  };
  return labelMap[type] || type;
};

const isIncome = (type: PointTransaction['type']): boolean => {
  return type === 'earn' || type === 'adjust_add' || type === 'refund';
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const prevPage = () => {
  page.value = Math.max(1, page.value - 1);
  void fetchTransactions();
};

const nextPage = () => {
  page.value = Math.min(totalPages.value, page.value + 1);
  void fetchTransactions();
};
</script>

<template>
  <div class="min-h-full bg-[#FFF7E6] p-6">
    <!-- 页面标题 -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[#1F2329]">积分流水</h1>
        <p class="mt-1 text-sm text-gray-500">
          {{ childName }}的积分获取与消耗记录
        </p>
      </div>
      <template v-if="mode === 'parent'">
        <Button
          size="lg"
          class="rounded-full bg-[#FF8A3D] hover:bg-[#FF7A2D]"
          @click="adjustDialogOpen = true"
        >
          <Plus class="h-5 w-5" />
          调整积分
        </Button>
        <Dialog v-model:modelValue="adjustDialogOpen" title="调整积分">
          <div class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">
                变动积分（正数补发，负数扣回）
              </label>
              <Input
                type="number"
                placeholder="如：10 或 -5"
                v-model:value="adjustAmount"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">
                调整原因
              </label>
              <Input
                placeholder="请输入调整原因"
                v-model:value="adjustReason"
              />
            </div>
          </div>
          <template #footer>
            <Button
              variant="outline"
              @click="adjustDialogOpen = false"
              class="rounded-full"
            >
              取消
            </Button>
            <Button
              class="rounded-full bg-[#FF8A3D] hover:bg-[#FF7A2D]"
              @click="void handleAdjust()"
              :disabled="submitting || !adjustAmount || !adjustReason.trim()"
            >
              {{ submitting ? '提交中...' : '确认调整' }}
            </Button>
          </template>
        </Dialog>
      </template>
    </div>

    <!-- 积分余额卡片 -->
    <div
      class="mb-6 rounded-2xl p-6 shadow-md"
      style="background: linear-gradient(135deg, #FF8A3D 0%, #FFB347 100%)"
    >
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-white/80">当前积分</p>
          <p class="mt-1 text-4xl font-bold text-white">
            {{ balance.toLocaleString() }}
          </p>
        </div>
        <div class="flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
          <Coins class="h-8 w-8 text-white" />
        </div>
      </div>
    </div>

    <!-- 流水列表 -->
    <div class="rounded-2xl bg-white p-4 shadow-md">
      <h2 class="mb-4 text-lg font-semibold text-[#1F2329]">积分明细</h2>

      <div v-if="loading" class="py-12 text-center text-gray-400">加载中...</div>
      <div v-else-if="transactions.length === 0" class="py-12 text-center text-gray-400">
        暂无积分记录
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="txn in transactions"
          :key="txn.id"
          class="flex items-center justify-between border-b border-gray-100 py-3 last:border-b-0"
        >
          <div class="flex items-center gap-3">
            <div
              :class="[
                'flex h-10 w-10 items-center justify-center rounded-full',
                isIncome(txn.type) ? 'bg-green-50' : 'bg-red-50',
              ]"
            >
              <TrendingUp
                v-if="isIncome(txn.type)"
                class="h-5 w-5 text-[#52C41A]"
              />
              <TrendingDown v-else class="h-5 w-5 text-[#FF4D4F]" />
            </div>
            <div>
              <p class="font-medium text-[#1F2329]">
                {{ txn.reason || formatTypeLabel(txn.type) }}
              </p>
              <p class="text-xs text-gray-500">
                {{ formatTypeLabel(txn.type) }} · {{ formatDate(txn.createdAt) }}
              </p>
            </div>
          </div>
          <div class="text-right">
            <p
              :class="[
                'text-lg font-bold',
                isIncome(txn.type) ? 'text-[#52C41A]' : 'text-[#FF4D4F]',
              ]"
            >
              {{ isIncome(txn.type) ? '+' : '' }}{{ txn.changeAmount }}
            </p>
            <p class="text-xs text-gray-500">
              余额 {{ txn.balanceAfter }}
            </p>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <div
        v-if="totalPages > 1"
        class="mt-4 flex items-center justify-center gap-2 border-t border-gray-100 pt-4"
      >
        <Button
          variant="outline"
          size="sm"
          class="rounded-full"
          @click="prevPage"
          :disabled="page === 1"
        >
          <ChevronLeft class="h-4 w-4" />
        </Button>
        <span class="text-sm text-gray-500">
          第 {{ page }} / {{ totalPages }} 页
        </span>
        <Button
          variant="outline"
          size="sm"
          class="rounded-full"
          @click="nextPage"
          :disabled="page === totalPages"
        >
          <ChevronRight class="h-4 w-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
