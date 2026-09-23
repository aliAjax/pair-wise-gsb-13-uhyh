<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useDeskStore } from "../store/desk";

const store = useDeskStore();

const draft = reactive({
  title: "",
  nozzlesText: "1,2,3,4",
  startedAt: "",
  slipFrom: "Z001",
  slipTo: "Z100",
  shift: "夜班"
});
const errors = reactive<Record<string, string>>({});
const message = ref("");

const stageSteps = ["停电中", "已复电", "已恢复营业"] as const;
const stageIndex = computed(() =>
  store.activeEvent ? stageSteps.indexOf(store.activeEvent.stage) : -1
);

function submit() {
  message.value = "";
  Object.keys(errors).forEach((k) => delete errors[k]);
  const affectedNozzles = draft.nozzlesText
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const result = store.createEvent({
    title: draft.title.trim() || "台风夜停电应急加油",
    affectedNozzles,
    startedAt: draft.startedAt,
    slipFrom: draft.slipFrom,
    slipTo: draft.slipTo,
    shift: draft.shift
  });
  if (!result.ok) {
    Object.assign(errors, result.errors);
    return;
  }
  message.value = "停电应急台已建档，可以开始手工加油";
}
</script>

<template>
  <section v-if="!store.activeEvent" class="panel setup">
    <h2>停电应急台建档</h2>
    <p class="hint">台风夜停电后启用：先登记受影响油枪、停电开始时刻与纸单号范围。</p>
    <form class="form-grid" @submit.prevent="submit">
      <label>
        事件名称（可选）
        <input v-model="draft.title" placeholder="如：台风“海燕”停电应急加油" />
      </label>
      <label>
        当前班次
        <select v-model="draft.shift">
          <option>早班</option>
          <option>中班</option>
          <option>晚班</option>
          <option>夜班</option>
        </select>
      </label>
      <label>
        受影响油枪（逗号分隔枪号）<span class="req">*</span>
        <input v-model="draft.nozzlesText" placeholder="如：1,2,3,4" />
        <small v-if="errors.affectedNozzles" class="err">{{ errors.affectedNozzles }}</small>
      </label>
      <label>
        停电开始时刻<span class="req">*</span>
        <input v-model="draft.startedAt" type="datetime-local" />
        <small v-if="errors.startedAt" class="err">{{ errors.startedAt }}</small>
      </label>
      <label>
        纸单号起<span class="req">*</span>
        <input v-model="draft.slipFrom" />
        <small v-if="errors.slipRange" class="err">{{ errors.slipRange }}</small>
      </label>
      <label>
        纸单号止<span class="req">*</span>
        <input v-model="draft.slipTo" />
      </label>
      <button type="submit">建立应急加油台</button>
      <p v-if="message" class="ok">{{ message }}</p>
    </form>
  </section>

  <section v-else class="panel event-head">
    <div class="event-top">
      <div>
        <h2>{{ store.activeEvent.title }}</h2>
        <p class="hint">
          建档于 {{ new Date(store.activeEvent.createdAt).toLocaleString("zh-CN") }}
        </p>
      </div>
      <span class="stage-badge" :class="`stage-${stageIndex}`">
        {{ store.activeEvent.stage }}
      </span>
    </div>

    <ol class="steps">
      <li v-for="(step, i) in stageSteps" :key="step" :class="{ on: i <= stageIndex, cur: i === stageIndex }">
        {{ step }}
      </li>
    </ol>

    <div class="event-meta">
      <div><span>受影响油枪</span><strong>{{ store.activeEvent.affectedNozzles.join("、") }} 号枪</strong></div>
      <div><span>停电开始</span><strong>{{ store.activeEvent.startedAt.replace("T", " ") }}</strong></div>
      <div><span>纸单号范围</span><strong>{{ store.activeEvent.slipFrom }} ~ {{ store.activeEvent.slipTo }}</strong></div>
      <div><span>当前班次</span><strong>{{ store.activeEvent.shift }}</strong></div>
      <div v-if="store.activeEvent.restoredAt">
        <span>复电时刻</span><strong>{{ new Date(store.activeEvent.restoredAt).toLocaleString("zh-CN") }}</strong>
      </div>
      <div v-if="store.activeEvent.resumedAt">
        <span>恢复营业</span><strong>{{ new Date(store.activeEvent.resumedAt).toLocaleString("zh-CN") }}</strong>
      </div>
    </div>

    <div v-if="store.activeEvent.stage === '停电中'" class="event-actions">
      <button type="button" @click="store.reportRestored()">已复电，进入小票匹配</button>
    </div>
    <div v-else-if="store.frozen" class="freeze-tip">
      🔒 已确认恢复营业，应急台数据冻结；如需更正，请在对应纸单上“另建更正版本（填原因）”。
    </div>
  </section>
</template>

<style scoped>
.setup h2,
.event-head h2 {
  margin: 0 0 6px;
}
.hint {
  margin: 0 0 12px;
  color: #69758c;
  font-size: 13px;
}
.req {
  color: #c84b31;
}
.err {
  color: #c84b31;
}
.ok {
  color: #14724f;
  margin: 0;
}
.event-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.stage-badge {
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  white-space: nowrap;
  background: #fff4e5;
  color: #b35a00;
}
.stage-badge.stage-1 {
  background: #e8f0fe;
  color: #1a56c8;
}
.stage-badge.stage-2 {
  background: #e8f4ef;
  color: #14724f;
}
.steps {
  display: flex;
  list-style: none;
  margin: 14px 0;
  padding: 0;
  gap: 0;
}
.steps li {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  font-size: 13px;
  color: #98a2b5;
  background: #f1f4f9;
  position: relative;
}
.steps li:first-child {
  border-radius: 8px 0 0 8px;
}
.steps li:last-child {
  border-radius: 0 8px 8px 0;
}
.steps li.on {
  color: #fff;
  background: #176b87;
}
.steps li.cur {
  box-shadow: inset 0 0 0 2px #64b6ac;
}
.event-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}
.event-meta div {
  background: #fbfcfe;
  border: 1px solid #e3e9f2;
  border-radius: 8px;
  padding: 10px 12px;
}
.event-meta span {
  display: block;
  font-size: 12px;
  color: #69758c;
}
.event-meta strong {
  display: block;
  margin-top: 4px;
  font-size: 15px;
}
.event-actions {
  margin-top: 14px;
}
.freeze-tip {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f3f0ff;
  color: #5b3db3;
  font-size: 14px;
}
</style>
