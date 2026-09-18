<template>
  <div class="min-h-full bg-[#FFF7E6] p-6">
    <template v-if="loading">
      <div class="text-gray-500">加载中...</div>
    </template>

    <template v-else>
      <div class="mx-auto max-w-2xl">
        <div class="mb-6 flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#36BFFA]/10 text-[#36BFFA]">
            <Sparkles class="h-5 w-5" />
          </div>
          <div>
            <h1 class="text-2xl font-bold text-[#1F2329]">AI 服务设置</h1>
            <p class="mt-1 text-sm text-gray-500">
              配置 AI 识别接口后，可智能识别作业内容并生成任务建议
            </p>
          </div>
        </div>

        <div class="rounded-2xl bg-white p-6 shadow-md">
          <div class="space-y-5">
            <!-- API 地址 -->
            <div class="space-y-2">
              <Label for="apiUrl" class="text-sm font-medium text-[#1F2329]">
                API 地址 <span class="text-[#FF4D4F]">*</span>
              </Label>
              <Input
                id="apiUrl"
                v-model:value="formData.apiUrl"
                type="url"
                placeholder="https://api.example.com/recognize"
                class="rounded-xl"
              />
              <p class="text-xs text-gray-400">
                填入 mock 可进入演示模式，如：https://mock.ai/recognize
              </p>
            </div>

            <!-- API 密钥 -->
            <div class="space-y-2">
              <Label for="apiKey" class="text-sm font-medium text-[#1F2329]">
                API 密钥 <span class="text-[#FF4D4F]">*</span>
              </Label>
              <div class="relative">
                <Input
                  id="apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  v-model:value="formData.apiKey"
                  :placeholder="apiKeyPlaceholder"
                  class="rounded-xl pr-10"
                  @update:value="handleApiKeyChange"
                />
                <button
                  type="button"
                  @click="showApiKey = !showApiKey"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <EyeOff v-if="showApiKey" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
              </div>
            </div>

            <!-- 模型名称 -->
            <div class="space-y-2">
              <Label for="modelName" class="text-sm font-medium text-[#1F2329]">
                模型名称 <span class="text-gray-400 font-normal">（可选）</span>
              </Label>
              <Input
                id="modelName"
                v-model:value="formData.modelName"
                type="text"
                placeholder="如：gpt-4o-mini"
                class="rounded-xl"
              />
            </div>

          </div>
        </div>

        <!-- 图片识别模型 -->
        <div class="mt-6 rounded-2xl bg-white p-6 shadow-md">
          <div class="mb-5 flex items-center gap-3">
            <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-[#52C41A]/10 text-[#52C41A]">
              <ImageIcon class="h-4 w-4" />
            </div>
            <div>
              <h2 class="text-base font-semibold text-[#1F2329]">图片识别模型</h2>
              <p class="text-xs text-gray-500">独立配置图片识别接口，用于拍照识别作业</p>
            </div>
          </div>

          <div class="space-y-5">
            <!-- 图片识别 API 地址 -->
            <div class="space-y-2">
              <Label for="imageApiUrl" class="text-sm font-medium text-[#1F2329]">
                API 地址 <span class="text-gray-400 font-normal">（可选）</span>
              </Label>
              <Input
                id="imageApiUrl"
                v-model:value="formData.imageApiUrl"
                type="url"
                placeholder="https://your-ai-api.com/image-recognize"
                class="rounded-xl"
              />
              <p class="text-xs text-gray-400">
                留空则复用文字识别配置
              </p>
            </div>

            <!-- 图片识别 API 密钥 -->
            <div class="space-y-2">
              <Label for="imageApiKey" class="text-sm font-medium text-[#1F2329]">
                API 密钥 <span class="text-gray-400 font-normal">（可选）</span>
              </Label>
              <div class="relative">
                <Input
                  id="imageApiKey"
                  :type="showImageApiKey ? 'text' : 'password'"
                  v-model:value="formData.imageApiKey"
                  :placeholder="imageApiKeyPlaceholder"
                  class="rounded-xl pr-10"
                  @update:value="handleImageApiKeyChange"
                />
                <button
                  type="button"
                  @click="showImageApiKey = !showImageApiKey"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <EyeOff v-if="showImageApiKey" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
              </div>
            </div>

            <!-- 图片识别模型名称 -->
            <div class="space-y-2">
              <Label for="imageModelName" class="text-sm font-medium text-[#1F2329]">
                模型名称 <span class="text-gray-400 font-normal">（可选）</span>
              </Label>
              <Input
                id="imageModelName"
                v-model:value="formData.imageModelName"
                type="text"
                placeholder="如：gpt-4o"
                class="rounded-xl"
              />
            </div>
          </div>
        </div>

        <!-- 操作区域 -->
        <div class="mt-6 rounded-2xl bg-white p-5 shadow-md">
          <!-- 启用开关 -->
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-[#1F2329]">启用 AI 识别</p>
              <p class="text-xs text-gray-500">开启后可在作业任务池使用 AI 识别功能</p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="formData.isEnabled"
              :class="[
                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#FF8A3D] focus:ring-offset-2',
                formData.isEnabled ? 'bg-[#FF8A3D]' : 'bg-gray-200',
              ]"
              @click="formData.isEnabled = !formData.isEnabled"
            >
              <span
                :class="[
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  formData.isEnabled ? 'translate-x-5' : 'translate-x-0',
                ]"
              />
            </button>
          </div>

          <!-- 操作按钮 -->
          <div class="mt-5 flex items-center gap-3 pt-5 border-t border-gray-100">
            <Button
              @click="handleSave"
              :disabled="saving"
              class="flex-1 rounded-full bg-[#FF8A3D] hover:bg-[#FF8A3D]/90"
            >
              <Save class="h-4 w-4" />
              {{ saving ? '保存中...' : '保存设置' }}
            </Button>
            <Button
              variant="outline"
              @click="handleTest"
              :disabled="testing"
              class="rounded-full border-[#36BFFA] text-[#36BFFA] hover:bg-[#36BFFA]/5"
            >
              <TestTube2 class="h-4 w-4" />
              {{ testing ? '测试中...' : '测试连接' }}
            </Button>
          </div>
        </div>

        <!-- 说明卡片 -->
        <div class="mt-6 rounded-2xl border border-[#36BFFA]/20 bg-[#36BFFA]/5 p-5">
          <h3 class="text-sm font-semibold text-[#36BFFA]">💡 使用说明</h3>
          <ul class="mt-3 space-y-2 text-sm text-gray-600">
            <li class="flex items-start gap-2">
              <Check class="mt-0.5 h-4 w-4 shrink-0 text-[#52C41A]" />
              <span>配置 API 地址和密钥后，即可在作业任务池使用 AI 智能识别</span>
            </li>
            <li class="flex items-start gap-2">
              <Check class="mt-0.5 h-4 w-4 shrink-0 text-[#52C41A]" />
              <span>AI 识别结果仅为建议，需家长确认后才会进入任务池</span>
            </li>
            <li class="flex items-start gap-2">
              <Check class="mt-0.5 h-4 w-4 shrink-0 text-[#52C41A]" />
              <span>接口返回格式需包含 tasks 数组，每项含 subject、content、quantity、suggestedPoints</span>
            </li>
            <li class="flex items-start gap-2">
              <X class="mt-0.5 h-4 w-4 shrink-0 text-[#FF4D4F]" />
              <span>API 密钥仅保存在服务端，前端不会回显明文</span>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Sparkles, Save, TestTube2, Check, X, Eye, EyeOff, ImageIcon } from 'lucide-vue-next';
import Button from '@/components/ui/Button.vue';
import { toast } from '@/components/ui/toast';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import type { AiSetting, UpdateAiSettingRequest } from '@shared/api.interface';
import { aiApi } from '@/api';

const setting = ref<AiSetting | null>(null);
const loading = ref<boolean>(true);
const saving = ref<boolean>(false);
const testing = ref<boolean>(false);
const showApiKey = ref<boolean>(false);
const apiKeyChanged = ref<boolean>(false);
const showImageApiKey = ref<boolean>(false);
const imageApiKeyChanged = ref<boolean>(false);

const formData = reactive({
  apiUrl: '',
  apiKey: '',
  modelName: '',
  imageApiUrl: '',
  imageApiKey: '',
  imageModelName: '',
  isEnabled: false,
});

const hasExistingKey = computed(
  () => !!setting.value?.hasApiKey,
);

const apiKeyPlaceholder = computed(() =>
  hasExistingKey.value && !apiKeyChanged.value
    ? '********（已保存，留空则不修改）'
    : '请输入 API 密钥',
);

const hasExistingImageKey = computed(
  () => !!setting.value?.hasImageApiKey,
);

const imageApiKeyPlaceholder = computed(() =>
  hasExistingImageKey.value && !imageApiKeyChanged.value
    ? '********（已保存，留空则不修改）'
    : '请输入图片识别 API 密钥',
);

async function loadSetting(): Promise<void> {
  try {
    loading.value = true;
    const result = await aiApi.getAiSetting();
    const s = result.setting;
    setting.value = s;
    if (s) {
      formData.apiUrl = s.apiUrl ?? '';
      formData.apiKey = '';
      formData.modelName = s.modelName ?? '';
      formData.imageApiUrl = s.imageApiUrl ?? '';
      formData.imageApiKey = '';
      formData.imageModelName = s.imageModelName ?? '';
      formData.isEnabled = s.isEnabled;
    }
  } catch (err) {
    logger.error('加载 AI 设置失败', err as Error);
    toast.error('加载失败，请重试');
  } finally {
    loading.value = false;
  }
}

async function handleSave(): Promise<void> {
  if (!formData.apiUrl.trim()) {
    toast.error('请填写 API 地址');
    return;
  }

  const data: UpdateAiSettingRequest = {
    apiUrl: formData.apiUrl.trim(),
    modelName: formData.modelName.trim() || undefined,
    imageApiUrl: formData.imageApiUrl.trim() || undefined,
    imageModelName: formData.imageModelName.trim() || undefined,
    isEnabled: formData.isEnabled,
  };

  if (apiKeyChanged.value && formData.apiKey) {
    data.apiKey = formData.apiKey;
  }
  if (imageApiKeyChanged.value && formData.imageApiKey) {
    data.imageApiKey = formData.imageApiKey;
  }

  try {
    saving.value = true;
    const result = await aiApi.updateAiSetting(data);
    setting.value = result.setting;
    apiKeyChanged.value = false;
    imageApiKeyChanged.value = false;
    formData.apiKey = '';
    formData.imageApiKey = '';
    toast.success('保存成功');
  } catch (err) {
    logger.error('保存 AI 设置失败', err as Error);
    toast.error('保存失败，请重试');
  } finally {
    saving.value = false;
  }
}

async function handleTest(): Promise<void> {
  if (!formData.apiUrl.trim()) {
    toast.error('请先填写并保存 API 地址');
    return;
  }
  testing.value = true;
  try {
    const result = await aiApi.testConnection();
    toast.success(result.message || '测试连接成功！');
  } catch (err) {
    logger.error('测试连接失败', err as Error);
    toast.error('测试连接失败，请检查配置');
  } finally {
    testing.value = false;
  }
}

function handleApiKeyChange(_value: string): void {
  apiKeyChanged.value = true;
}

function handleImageApiKeyChange(_value: string): void {
  imageApiKeyChanged.value = true;
}

onMounted(() => {
  void loadSetting();
});
</script>
