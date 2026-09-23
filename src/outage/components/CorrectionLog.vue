<script setup lang="ts">
/** 冻结后更正留痕：原因版本列表 */
import { useOutageStore } from "../store";
import { FIELD_LABELS, fmtDateTime } from "../format";
</script>

<template>
  <el-card shadow="never" class="panel-card">
    <template #header>
      <span class="card-title">⑥ 更正原因版本（冻结留痕）</span>
    </template>
    <el-timeline v-if="store.corrections.length" class="log">
      <el-timeline-item
        v-for="c in store.corrections"
        :key="c.id"
        type="warning"
        :timestamp="`${fmtDateTime(c.createdAt)} · ${c.operator}`"
      >
        <p class="line">
          <el-tag size="small" type="warning">{{ FIELD_LABELS[c.field] ?? c.field }}</el-tag>
          <span class="from">{{ c.before === "null" ? "空缺" : c.before }}</span>
          <span class="arrow">→</span>
          <span class="to">{{ c.after === "null" ? "空缺" : c.after }}</span>
        </p>
        <p class="reason">原因：{{ c.reason }}</p>
      </el-timeline-item>
    </el-timeline>
    <el-empty v-else description="冻结后暂无更正记录" :image-size="80" />
  </el-card>
</template>

<style scoped>
.log { padding: 6px 8px 0; }
.line { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; font-size: 14px; }
.from { color: #909399; text-decoration: line-through; }
.arrow { color: #c45656; }
.to { color: #16834c; font-weight: 700; }
.reason { margin: 0; color: #5b667a; font-size: 13px; }
</style>
