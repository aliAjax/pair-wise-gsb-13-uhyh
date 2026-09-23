<script setup lang="ts">
/** 班次交接：未处理完不能关班；写交班原因后下一班承接 */
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useOutageStore } from "../store";
import { checkCloseShift, pendingEntries } from "../rules";
import { CLOSE_BLOCKER_TEXT, fmtDateTime } from "../format";

const store = useOutageStore();

const SHIFT_OPTIONS = ["早班", "中班", "晚班", "夜班"];
const current = computed(() => store.currentShift);

const pendingCount = computed(() =>
  current.value ? pendingEntries(store.state, current.value).length : 0
);
const closeCheck = computed(() =>
  current.value ? checkCloseShift(store.state, current.value) : null
);

const dialogVisible = ref(false);
const form = reactive({ nextName: "早班", nextOperator: "", reason: "" });

function openHandover() {
  form.nextName = "早班";
  form.nextOperator = "";
  form.reason = "";
  dialogVisible.value = true;
}

function submitHandover() {
  const res = store.handover(form.reason, form.nextName, form.nextOperator);
  if (!res.ok) {
    ElMessage.error(res.error);
    return;
  }
  ElMessage.success("已记录交班原因，下一班承接未处理事项");
  dialogVisible.value = false;
}

function doClose() {
  const res = store.closeShift();
  if (!res.ok) {
    ElMessage.error(res.error);
    return;
  }
  ElMessage.success("全部事项处理完毕，班次已正常关闭");
}

const orderedShifts = computed(() => [...store.shifts].sort((a, b) => a.seq - b.seq));

function shiftTimestamp(s: { openedAt: string; closedAt: string | null }): string {
  return `开班 ${fmtDateTime(s.openedAt)}${s.closedAt ? `　关班 ${fmtDateTime(s.closedAt)}` : "　进行中"}`;
}
</script>

<template>
  <el-card shadow="never" class="panel-card">
    <template #header>
      <span class="card-title">⑤ 班次交接</span>
    </template>

    <el-timeline class="mb">
      <el-timeline-item
        v-for="s in orderedShifts"
        :key="s.id"
        :type="s.closedAt ? 'primary' : 'success'"
        :hollow="!!s.closedAt"
        :timestamp="shiftTimestamp(s)"
      >
        <p class="shift-line">
          <b>第{{ s.seq }}班 · {{ s.name }}</b>
          <span class="dim">开班人：{{ s.openedBy }}</span>
          <el-tag v-if="!s.closedAt" type="success" size="small">当前班</el-tag>
          <el-tag v-else-if="s.closeReason" type="warning" size="small">交班承接</el-tag>
          <el-tag v-else type="info" size="small">正常关班</el-tag>
        </p>
        <el-alert
          v-if="s.closeReason"
          type="warning"
          :closable="false"
          class="reason-box"
          :title="`交班原因：${s.closeReason}`"
        />
      </el-timeline-item>
    </el-timeline>

    <template v-if="current">
      <el-descriptions :column="2" size="small" border class="mb">
        <el-descriptions-item label="承接范围未处理纸单">
          <span :class="pendingCount > 0 ? 'bad' : 'ok'">{{ pendingCount }} 单</span>
        </el-descriptions-item>
        <el-descriptions-item label="关班条件">
          <el-tag v-if="closeCheck?.ok" type="success" size="small">可以正常关班</el-tag>
          <el-tag v-else type="danger" size="small">不能关班</el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <el-alert
        v-if="!closeCheck?.ok"
        type="warning"
        :closable="false"
        show-icon
        class="mb"
        :title="'阻断项：' + (closeCheck?.blockers ?? []).map((b) => CLOSE_BLOCKER_TEXT[b]).join('；')"
        description="未处理完不能关班。请填写交班原因，下一班带着原因和全部待处理纸单继续。"
      />

      <div class="btn-row">
        <el-button :disabled="!closeCheck?.ok" type="success" @click="doClose">全部处理完，正常关班</el-button>
        <el-button :disabled="closeCheck?.ok" type="warning" plain @click="openHandover">
          处理不完，写原因交班
        </el-button>
      </div>
    </template>
    <el-empty v-else description="当前没有进行中的班次" :image-size="70" />

    <el-dialog v-model="dialogVisible" title="交班原因（下一班承接）" width="480px">
      <el-form label-position="top">
        <el-row :gutter="10">
          <el-col :span="12">
            <el-form-item label="下一班" required>
              <el-select v-model="form.nextName" class="full">
                <el-option v-for="o in SHIFT_OPTIONS" :key="o" :label="o" :value="o" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="接班人员" required>
              <el-input v-model="form.nextOperator" placeholder="姓名" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="交班原因（必填，不少于 5 字）" required>
          <el-input
            v-model="form.reason"
            type="textarea"
            :rows="3"
            placeholder="如：K20 收款金额待车主电话确认，4 号枪小票终端尚未补传，下一班跟进核销"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="warning" @click="submitHandover">确认交班并承接</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<style scoped>
.mb { margin-bottom: 12px; }
.shift-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 14px;
}
.dim { color: #909399; font-size: 12px; }
.reason-box { padding: 4px 10px; }
.btn-row { display: flex; gap: 10px; flex-wrap: wrap; }
.bad { color: #c45656; font-weight: 700; }
.ok { color: #16834c; font-weight: 700; }
</style>
