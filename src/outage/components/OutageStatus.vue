<script setup lang="ts">
/** 停电事件进展：复电登记 → 设备自检 → 油枪复位 → 确认恢复营业（确认即冻结） */
import { computed } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useOutageStore } from "../store";
import {
  CLOSE_BLOCKER_TEXT,
  fmtDateTime,
  PHASE_META,
  RESUME_BLOCKER_TEXT
} from "../format";

const store = useOutageStore();
const event = computed(() => store.outage);
const meta = computed(() => (event.value ? PHASE_META[event.value.phase] : null));

async function restorePower() {
  const res = store.markPowerRestored();
  if (res.ok) ElMessage.success("已登记复电，请等待终端补传小票并安排设备自检");
  else ElMessage.error(res.error);
}

function toggleSelfCheck() {
  store.setSelfCheck(!event.value?.deviceSelfCheckPassed);
}
function toggleGunReset() {
  store.setGunReset(!event.value?.gunResetPassed);
}

async function confirmResume() {
  const info = store.resumeInfo;
  if (!info.ok) {
    ElMessage.error(info.blockers.map((b) => RESUME_BLOCKER_TEXT[b]).join("；"));
    return;
  }
  try {
    await ElMessageBox.confirm(
      "设备自检与油枪复位均已通过、纸单全部核销。确认恢复营业后，本次停电数据立即冻结，后续更正必须另建原因版本。",
      "确认恢复营业并冻结数据",
      { type: "warning", confirmButtonText: "确认恢复营业", cancelButtonText: "再检查一下" }
    );
  } catch {
    return;
  }
  const res = store.resume();
  if (res.ok) ElMessage.success("已恢复营业，数据已冻结");
  else if (res.blockers) ElMessage.error(res.blockers.map((b) => RESUME_BLOCKER_TEXT[b as keyof typeof RESUME_BLOCKER_TEXT]).join("；"));
  else ElMessage.error(res.error);
}

const closeBlockers = computed(() => store.closeInfo?.blockers ?? []);
</script>

<template>
  <el-card v-if="event" shadow="never" class="panel-card">
    <template #header>
      <div class="head">
        <span class="card-title">停电事件进展</span>
        <el-tag v-if="meta" :type="meta.type" effect="dark">{{ meta.label }}</el-tag>
      </div>
    </template>

    <el-descriptions :column="2" border size="small" class="mb">
      <el-descriptions-item label="受影响油枪">
        <el-tag v-for="g in event.affectedGuns" :key="g" type="danger" effect="plain" class="gun">
          {{ g }} 号枪
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="停电开始时刻">{{ fmtDateTime(event.startedAt) }}</el-descriptions-item>
      <el-descriptions-item label="纸单号范围" :span="2">
        {{ event.paperStart }} ～ {{ event.paperEnd }}
      </el-descriptions-item>
      <el-descriptions-item label="复电时刻">{{ fmtDateTime(event.powerRestoredAt) }}</el-descriptions-item>
      <el-descriptions-item label="恢复营业 / 冻结时刻">{{ fmtDateTime(event.resumedAt) }}</el-descriptions-item>
    </el-descriptions>

    <!-- 停电中：等待复电 -->
    <div v-if="event.phase === 'ACTIVE'" class="stage">
      <el-alert type="error" :closable="false" show-icon title="加油机离线，只能凭纸单手工加油" class="mb" />
      <el-button type="warning" class="full" @click="restorePower">已复电，登记复电时刻</el-button>
    </div>

    <!-- 复电后：双检 + 核销 -->
    <div v-else-if="event.phase === 'POWER_RESTORED'" class="stage">
      <div class="check-row">
        <div>
          <strong>设备自检</strong>
          <p>加油机主板、通讯模块、计量主板自检无故障</p>
        </div>
        <el-switch
          :model-value="event.deviceSelfCheckPassed"
          active-text="通过"
          inactive-text="未通过"
          inline-prompt
          @change="toggleSelfCheck"
        />
      </div>
      <div class="check-row">
        <div>
          <strong>油枪复位</strong>
          <p>受影响油枪回零、试枪正常后逐把确认复位</p>
        </div>
        <el-switch
          :model-value="event.gunResetPassed"
          active-text="通过"
          inactive-text="未通过"
          inline-prompt
          @change="toggleGunReset"
        />
      </div>
      <el-alert
        :type="store.resumeInfo.ok ? 'success' : 'info'"
        :closable="false"
        show-icon
        class="mb"
        :title="store.resumeInfo.ok
          ? '双检通过且纸单全部核销，可以恢复营业'
          : '恢复营业前置条件：' + store.resumeInfo.blockers.map((b) => RESUME_BLOCKER_TEXT[b]).join('；')"
      />
      <el-button type="success" class="full" @click="confirmResume">
        双检通过，确认恢复营业（确认后冻结）
      </el-button>
    </div>

    <!-- 已冻结 -->
    <div v-else class="stage">
      <el-alert
        type="success"
        :closable="false"
        show-icon
        title="数据已冻结。更正纸单须填写原因，系统另存原因版本，不覆盖历史。"
      />
      <el-alert
        v-if="closeBlockers.length"
        type="warning"
        :closable="false"
        show-icon
        class="mt"
        :title="'当前班不能关班：' + closeBlockers.map((b) => CLOSE_BLOCKER_TEXT[b]).join('；')"
      />
    </div>
  </el-card>
</template>

<style scoped>
.head { display: flex; align-items: center; justify-content: space-between; }
.mb { margin-bottom: 12px; }
.mt { margin-top: 10px; }
.gun { margin-right: 6px; }
.stage { display: grid; gap: 10px; }
.full { width: 100%; }
.check-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px 12px;
}
.check-row p { margin: 4px 0 0; color: #909399; font-size: 12px; }
</style>
