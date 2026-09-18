<template>
  <div class="flex min-h-full items-center justify-center bg-[#FFF7E6] p-4 sm:p-6">
    <div class="rounded-2xl bg-white p-8 text-center shadow-md">
      <div class="mb-4 text-6xl">🔍</div>
      <h1 class="text-2xl font-bold text-[#1F2329]">页面不存在</h1>
      <p class="mt-2 text-sm text-gray-500">抱歉，您访问的页面不存在或已被移除</p>
      <Button @click="goHome" class="mt-6 rounded-full">
        返回首页
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import Button from '@/components/ui/Button.vue';

const router = useRouter();

function goHome(): void {
  router.push('/');
}
</script>
