<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  Plus, Edit2, Trash2, Gift, Coins, ToggleLeft, ToggleRight,
} from 'lucide-vue-next';
import Button from '@/components/ui/Button.vue';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import { rewardApi, pointApi, redemptionApi } from '@/api';
import { useChildStore } from '@/stores/child';
import type { Reward, RewardUsage } from '@shared/api.interface';
import Image from '@/components/ui/Image.vue';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/utils/error';
import { fenToYuan, yuanToFen } from '@/utils/money';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';

const props = withDefaults(defineProps<{
  mode?: 'parent' | 'child';
}>(), {
  mode: 'parent',
});

interface RewardFormData {
  name: string;
  pointsRequired: string;
  description: string;
  imageUrl: string;
  sortOrder: string;
  frequency: 'unlimited' | 'daily' | 'weekly' | 'monthly';
  limitCount: string;
  limitPoints: string;
  rewardType: 'item' | 'allowance';
  allowanceAmount: string;
}

const FREQUENCY_OPTIONS = [
  { value: 'unlimited', label: '不限' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
];

const childStore = useChildStore();
const currentChild = computed(() => childStore.currentChild);
const childId = computed(() => currentChild.value?.id ?? '');

const rewards = ref<Reward[]>([]);
const childBalance = ref<number>(0);
const loading = ref<boolean>(false);
const dialogOpen = ref<boolean>(false);
const editingReward = ref<Reward | null>(null);
const formData = reactive<RewardFormData>({
  name: '',
  pointsRequired: '',
  description: '',
  imageUrl: '',
  sortOrder: '',
  frequency: 'unlimited',
  limitCount: '',
  limitPoints: '',
  rewardType: 'item',
  allowanceAmount: '',
});
const usageMap = ref<Record<string, RewardUsage>>({});
const submitting = ref<boolean>(false);
const redeemLoading = ref<string | null>(null);
const confirmRedeem = ref<Reward | null>(null);
const deleteConfirmOpen = ref<boolean>(false);
const deleteTargetId = ref<string | null>(null);

const fetchRewards = async () => {
  loading.value = true;
  try {
    const includeInactive = props.mode === 'parent';
    const result = await rewardApi.listRewards(includeInactive);
    rewards.value = result.items;
  } catch (error) {
    logger.error('获取奖励列表失败', error);
  } finally {
    loading.value = false;
  }
};

const fetchBalance = async () => {
  if (props.mode !== 'child' || !childId.value) return;
  try {
    const result = await pointApi.getBalance(childId.value);
    childBalance.value = result.balance;
  } catch (error) {
    logger.error('获取孩子积分失败', error);
  }
};

const fetchUsage = async () => {
  if (props.mode !== 'child' || !childId.value) {
    usageMap.value = {};
    return;
  }
  try {
    const result = await rewardApi.getUsage(childId.value);
    const map: Record<string, RewardUsage> = {};
    for (const item of result.items) map[item.rewardId] = item;
    usageMap.value = map;
  } catch (error) {
    logger.error('获取奖励兑换用量失败', error);
  }
};

onMounted(() => {
  void fetchRewards();
  void fetchBalance();
  void fetchUsage();
});

watch(() => props.mode, () => {
  void fetchRewards();
  void fetchBalance();
  void fetchUsage();
});

watch(childId, () => {
  void fetchBalance();
  void fetchUsage();
});

const openCreateDialog = () => {
  editingReward.value = null;
  formData.name = '';
  formData.pointsRequired = '';
  formData.description = '';
  formData.imageUrl = '';
  formData.sortOrder = '';
  formData.frequency = 'unlimited';
  formData.limitCount = '';
  formData.limitPoints = '';
  formData.rewardType = 'item';
  formData.allowanceAmount = '';
  dialogOpen.value = true;
};

const openEditDialog = (reward: Reward) => {
  editingReward.value = reward;
  formData.name = reward.name;
  formData.pointsRequired = String(reward.pointsRequired);
  formData.description = reward.description || '';
  formData.imageUrl = reward.imageUrl || '';
  formData.sortOrder = String(reward.sortOrder);
  formData.frequency = reward.frequency ?? 'unlimited';
  formData.limitCount = reward.limitCount != null ? String(reward.limitCount) : '';
  formData.limitPoints = reward.limitPoints != null ? String(reward.limitPoints) : '';
  formData.rewardType = reward.rewardType ?? 'item';
  formData.allowanceAmount =
    reward.allowanceAmount != null ? fenToYuan(reward.allowanceAmount) : '';
  dialogOpen.value = true;
};

const handleSubmit = async () => {
  if (!formData.name.trim() || !formData.pointsRequired) return;

  const points = parseInt(formData.pointsRequired, 10);
  if (isNaN(points) || points <= 0) return;

  submitting.value = true;
  try {
    const unlimited = formData.frequency === 'unlimited';
    const payload = {
      name: formData.name.trim(),
      pointsRequired: points,
      description: formData.description || undefined,
      imageUrl: formData.imageUrl || undefined,
      sortOrder: formData.sortOrder
        ? parseInt(formData.sortOrder, 10)
        : undefined,
      frequency: formData.frequency,
      limitCount:
        unlimited || !formData.limitCount
          ? null
          : parseInt(formData.limitCount, 10),
      limitPoints:
        unlimited || !formData.limitPoints
          ? null
          : parseInt(formData.limitPoints, 10),
      rewardType: formData.rewardType,
      allowanceAmount:
        formData.rewardType === 'allowance' && formData.allowanceAmount
          ? yuanToFen(formData.allowanceAmount)
          : null,
    };

    if (editingReward.value) {
      await rewardApi.updateReward(editingReward.value.id, payload);
    } else {
      await rewardApi.createReward(payload);
    }

    dialogOpen.value = false;
    await fetchRewards();
    await fetchUsage();
  } catch (error) {
    logger.error('保存奖励失败', error);
    toast.error(getErrorMessage(error, '保存失败，请重试'));
  } finally {
    submitting.value = false;
  }
};

function handleDeleteClick(rewardId: string): void {
  deleteTargetId.value = rewardId;
  deleteConfirmOpen.value = true;
}

const handleDeleteConfirm = async () => {
  if (!deleteTargetId.value) return;
  try {
    await rewardApi.deleteReward(deleteTargetId.value);
    deleteConfirmOpen.value = false;
    deleteTargetId.value = null;
    await fetchRewards();
  } catch (error) {
    logger.error('删除奖励失败', error);
  }
};

const handleToggleActive = async (reward: Reward) => {
  try {
    await rewardApi.updateReward(reward.id, { isActive: !reward.isActive });
    await fetchRewards();
  } catch (error) {
    logger.error('切换奖励状态失败', error);
  }
};

const handleRedeem = async (reward: Reward) => {
  redeemLoading.value = reward.id;
  try {
    await redemptionApi.createRedemption({
      rewardId: reward.id,
      childId: childId.value,
    });
    confirmRedeem.value = null;
    await fetchBalance();
    await fetchUsage();
    logger.info(`兑换申请提交成功: ${reward.name}`);
    toast(`兑换申请已提交，等待家长审核！\n消耗 ${reward.pointsRequired} 积分`);
  } catch (error) {
    logger.error('兑换失败', error);
    toast.error(getErrorMessage(error, '兑换失败，请稍后重试'));
  } finally {
    redeemLoading.value = null;
  }
};

const FREQ_LABEL: Record<string, string> = {
  unlimited: '不限',
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
};

/** 奖励的限额说明，如「每周：最多 2 次，最多 50 积分」 */
const limitSummary = (reward: Reward): string => {
  if (!reward.frequency || reward.frequency === 'unlimited') return '';
  const parts: string[] = [];
  if (reward.limitCount != null) parts.push(`最多 ${reward.limitCount} 次`);
  if (reward.limitPoints != null) parts.push(`最多 ${reward.limitPoints} 积分`);
  const head = FREQ_LABEL[reward.frequency] ?? '';
  return parts.length ? `${head}：${parts.join('，')}` : head;
};

/** 孩子端：本期已用情况，如「本期已 1/2 次」 */
const usageSummary = (reward: Reward): string => {
  const u = usageMap.value[reward.id];
  if (!u) return '';
  const parts: string[] = [];
  if (u.limitCount != null) parts.push(`${u.count}/${u.limitCount} 次`);
  if (u.limitPoints != null) parts.push(`${u.points}/${u.limitPoints} 积分`);
  return parts.length ? `本期已用 ${parts.join('，')}` : '';
};

/** 是否已触发限额；返回提示文案（null = 未触发） */
const limitReached = (reward: Reward): string | null => {
  const u = usageMap.value[reward.id];
  if (!u) return null;
  if (u.limitCount != null && u.count >= u.limitCount) {
    return `本期兑换次数已达上限（${u.count}/${u.limitCount}）`;
  }
  if (
    u.limitPoints != null &&
    u.points + reward.pointsRequired > u.limitPoints
  ) {
    return `本期积分额度不足（已用 ${u.points}/${u.limitPoints}）`;
  }
  return null;
};

const canRedeem = (reward: Reward): boolean => {
  return (
    childBalance.value >= reward.pointsRequired && limitReached(reward) === null
  );
};

const pointsShortage = (reward: Reward): number => {
  return Math.max(0, reward.pointsRequired - childBalance.value);
};

const handleConfirmRedeemOpenChange = (open: boolean) => {
  if (!open) confirmRedeem.value = null;
};
</script>

<template>
  <div class="min-h-full bg-[#FFF7E6] p-4 sm:p-6">
    <!-- 页面标题 -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[#1F2329]">
          {{ mode === 'parent' ? '奖励管理' : '奖励中心' }}
        </h1>
        <p class="mt-1 text-sm text-gray-500">
          {{ mode === 'parent' ? '管理可兑换的奖励库' : '用积分兑换喜欢的奖励' }}
        </p>
      </div>

      <!-- 家长端：添加奖励按钮 + 弹窗 -->
      <template v-if="mode === 'parent'">
        <Button
          size="lg"
          class="rounded-full"
          style="background-color: #FF8A3D"
          @click="openCreateDialog"
        >
          <Plus class="h-5 w-5" />
          添加奖励
        </Button>
        <Dialog
          v-model:modelValue="dialogOpen"
          :title="editingReward ? '编辑奖励' : '添加奖励'"
        >
          <div class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">
                奖励名称 *
              </label>
              <Input
                placeholder="如：看电影、买玩具"
                v-model:value="formData.name"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">
                所需积分 *
              </label>
              <Input
                type="number"
                placeholder="请输入积分值"
                v-model:value="formData.pointsRequired"
              />
            </div>
            <div class="flex items-center justify-between gap-3 rounded-xl bg-blue-50/60 p-3">
              <div class="min-w-0">
                <p class="text-sm font-medium text-[#1F2329]">这是「零花钱」奖励</p>
                <p class="mt-0.5 text-xs text-gray-500">
                  孩子兑换并审批通过后，金额计入零花钱收入
                </p>
              </div>
              <Switch
                :checked="formData.rewardType === 'allowance'"
                @update:checked="(v: boolean) => formData.rewardType = v ? 'allowance' : 'item'"
                class="data-[state=checked]:bg-[#52C41A]"
              />
            </div>
            <div v-if="formData.rewardType === 'allowance'">
              <label class="mb-1 block text-sm font-medium text-gray-700">
                零花钱金额（元）*
              </label>
              <Input
                type="number"
                placeholder="如：5"
                v-model:value="formData.allowanceAmount"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">
                奖励描述
              </label>
              <Input
                placeholder="奖励的详细说明"
                v-model:value="formData.description"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">
                图片链接
              </label>
              <Input
                placeholder="https://..."
                v-model:value="formData.imageUrl"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">
                兑奖频率
              </label>
              <Select
                v-model:modelValue="formData.frequency"
                :options="FREQUENCY_OPTIONS"
              />
              <p class="mt-1 text-xs text-gray-400">
                限制孩子在一段时间内兑换该奖励的次数 / 积分；「不限」表示不限制
              </p>
            </div>
            <div
              v-if="formData.frequency !== 'unlimited'"
              class="grid grid-cols-2 gap-3"
            >
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-700">
                  次数上限
                </label>
                <Input
                  type="number"
                  placeholder="留空不限"
                  v-model:value="formData.limitCount"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-700">
                  积分上限
                </label>
                <Input
                  type="number"
                  placeholder="留空不限"
                  v-model:value="formData.limitPoints"
                />
              </div>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">
                排序权重
              </label>
              <Input
                type="number"
                placeholder="数字越小越靠前"
                v-model:value="formData.sortOrder"
              />
            </div>
          </div>
          <template #footer>
            <Button
              variant="outline"
              @click="dialogOpen = false"
              class="rounded-full"
            >
              取消
            </Button>
            <Button
              class="rounded-full"
              style="background-color: #FF8A3D"
              @click="void handleSubmit()"
              :disabled="
                submitting ||
                !formData.name.trim() ||
                !formData.pointsRequired
              "
            >
              {{ submitting ? '保存中...' : '保存' }}
            </Button>
          </template>
        </Dialog>
      </template>

      <!-- 孩子端：积分余额 -->
      <div
        v-if="mode === 'child'"
        class="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-md"
      >
        <Coins class="h-5 w-5 text-[#FF8A3D]" />
        <span class="font-bold text-[#FF8A3D]">
          {{ childBalance.toLocaleString() }}
        </span>
        <span class="text-sm text-gray-500">积分</span>
      </div>
    </div>

    <!-- 奖励列表 -->
    <div v-if="loading" class="py-12 text-center text-gray-400">加载中...</div>
    <div v-else-if="rewards.length === 0" class="rounded-2xl bg-white p-12 text-center shadow-md">
      <Gift class="mx-auto mb-3 h-12 w-12 text-gray-300" />
      <p class="text-gray-400">
        {{ mode === 'parent' ? '暂无奖励，点击上方添加' : '暂无可兑换奖励' }}
      </p>
    </div>
    <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="reward in rewards"
        :key="reward.id"
        :class="[
          'overflow-hidden rounded-2xl bg-white shadow-md transition-shadow hover:shadow-lg',
          mode === 'parent' && !reward.isActive ? 'opacity-60' : '',
        ]"
      >
        <!-- 图片区 -->
        <div class="relative h-40 bg-gradient-to-br from-orange-100 to-orange-50">
          <template v-if="reward.imageUrl">
            <Image
              :src="reward.imageUrl"
              :alt="reward.name"
              class="h-full w-full object-cover"
            />
          </template>
          <div v-else class="flex h-full w-full items-center justify-center">
            <Gift class="h-16 w-16 text-[#FF8A3D]/40" />
          </div>

          <div v-if="mode === 'parent'" class="absolute right-2 top-2 flex gap-1">
            <button
              @click="openEditDialog(reward)"
              class="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-gray-600 hover:bg-white"
            >
              <Edit2 class="h-4 w-4" />
            </button>
            <button
              @click="handleDeleteClick(reward.id)"
              class="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-red-500 hover:bg-white"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- 信息区 -->
        <div class="p-4">
          <div class="flex items-start justify-between">
            <h3 class="text-lg font-semibold text-[#1F2329]">
              {{ reward.name }}
            </h3>
            <button
              v-if="mode === 'parent'"
              @click="void handleToggleActive(reward)"
              class="text-gray-400 hover:text-[#FF8A3D]"
            >
              <ToggleRight v-if="reward.isActive" class="h-6 w-6 text-[#52C41A]" />
              <ToggleLeft v-else class="h-6 w-6" />
            </button>
          </div>
          <p
            v-if="reward.description"
            class="mt-1 text-sm text-gray-500 line-clamp-2"
          >
            {{ reward.description }}
          </p>
          <p
            v-if="limitSummary(reward)"
            class="mt-1 text-xs font-medium text-[#A855F7]"
          >
            {{ limitSummary(reward) }}
          </p>
          <p
            v-if="reward.rewardType === 'allowance' && reward.allowanceAmount"
            class="mt-1 text-xs font-semibold text-[#52C41A]"
          >
            💰 兑换可得 ¥{{ fenToYuan(reward.allowanceAmount) }} 零花钱
          </p>
          <p
            v-if="mode === 'child' && usageSummary(reward)"
            class="mt-0.5 text-xs text-gray-400"
          >
            {{ usageSummary(reward) }}
          </p>
          <div class="mt-3 flex items-center justify-between">
            <div class="flex items-center gap-1">
              <Coins class="h-4 w-4 text-[#FF8A3D]" />
              <span class="font-bold text-[#FF8A3D]">
                {{ reward.pointsRequired }}
              </span>
              <span class="text-xs text-gray-500">积分</span>
            </div>

            <!-- 孩子端：兑换按钮 -->
            <template v-if="mode === 'child'">
              <Button
                v-if="canRedeem(reward)"
                size="sm"
                class="rounded-full"
                style="background-color: #FF8A3D"
                :disabled="redeemLoading === reward.id"
                @click="confirmRedeem = reward"
              >
                {{ redeemLoading === reward.id ? '兑换中...' : '立即兑换' }}
              </Button>
              <div v-else class="text-right">
                <p class="text-xs text-gray-400">
                  {{ limitReached(reward) ? '本期无法兑换' : '还差' }}
                </p>
                <p class="text-sm font-medium text-gray-500">
                  {{ limitReached(reward) ?? `${pointsShortage(reward)} 积分` }}
                </p>
              </div>
            </template>
            <!-- 家长端：状态标签 -->
            <span
              v-else
              :class="[
                'rounded-full px-2 py-0.5 text-xs font-medium',
                reward.isActive
                  ? 'bg-green-50 text-[#52C41A]'
                  : 'bg-gray-100 text-gray-500',
              ]"
            >
              {{ reward.isActive ? '已上架' : '已下架' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 兑换确认弹窗 -->
    <Dialog
      :modelValue="!!confirmRedeem"
      @update:modelValue="handleConfirmRedeemOpenChange"
      title="确认兑换"
    >
      <div v-if="confirmRedeem" class="space-y-4">
        <p>
          确定要兑换
          <span class="mx-1 font-semibold text-[#FF8A3D]">
            {{ confirmRedeem.name }}
          </span>
          吗？
        </p>
        <div class="rounded-xl bg-orange-50 p-4">
          <div class="flex items-center justify-between">
            <span class="text-gray-600">消耗积分</span>
            <span class="text-xl font-bold text-[#FF8A3D]">
              -{{ confirmRedeem.pointsRequired }}
            </span>
          </div>
          <div class="mt-2 flex items-center justify-between border-t border-orange-100 pt-2">
            <span class="text-gray-600">兑换后余额</span>
            <span class="font-semibold text-[#1F2329]">
              {{ childBalance - confirmRedeem.pointsRequired }} 积分
            </span>
          </div>
        </div>
        <p class="text-sm text-gray-500">
          提交后将等待家长审核，审核通过后奖励生效。
        </p>
      </div>
      <template #footer>
        <Button
          variant="outline"
          @click="confirmRedeem = null"
          class="rounded-full"
        >
          取消
        </Button>
        <Button
          class="rounded-full"
          style="background-color: #FF8A3D"
          @click="confirmRedeem && void handleRedeem(confirmRedeem)"
          :disabled="!!redeemLoading"
        >
          确认兑换
        </Button>
      </template>
    </Dialog>

    <!-- 删除确认弹窗 -->
    <ConfirmDialog
      v-model:modelValue="deleteConfirmOpen"
      title="确认删除"
      message="确定要删除这个奖励吗？删除后无法恢复。"
      confirmText="确认删除"
      @confirm="void handleDeleteConfirm()"
    />
  </div>
</template>
