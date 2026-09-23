<script setup lang="ts">
/** 停电事件登记：受影响油枪、开始时刻、纸单号范围 */
import { reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useOutageStore } from "../store";
import { nowLocalInput } from "../format";

const store = useOutageStore();

const gunInput = ref("");
const form = reactive({
  startedAt: nowLocalInput(),
  paperStart: "",
  paperEnd: ""
});

function addGun() {
  const v = gunInput.value.trim();
  if (!v) return;
  if (!store.outage) return;
  const guns = draftGuns.value;
  if (!guns.includes(v)) draftGuns.value = [...guns, v];
  gunInput.value = "";
}

/** 未登记前用本地草稿暂存油枪，登记成功后由 store 接管 */
const draftGuns = ref<string[]>([]);
function removeGun(g: string) {
  draftGuns.value = draftGuns.value.filter((x) => x !== g);
}

function submit() {
  const res = store.registerOutage({
    affectedGuns: draftGuns.value,
    startedAt: form.startedAt,
    paperStart: form.paperStart,
    paperEnd: form.paperEnd
  });
  if (!res.ok) {
    ElMessage.error(res.error);
    return;
  }
  ElMessage.success("停电事件已登记，进入手工加油模式");
  draftGuns.value = [];
  form.paperStart = "";
  form.paperEnd = "";
}
</script>

<template>
  <el-card shadow="never" class="panel-card">
    <template #header>
      <span class="card-title">① 登记停电应急台</span>
    </template>
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="台风夜停电，加油机与 POS 离线。先登记受影响油枪、停电开始时刻和纸单号范围，随后凭纸单手工加油。"
      class="mb"
    />
    <el-form label-position="top" @submit.prevent>
      <el-form-item label="受影响油枪（枪号）" required>
        <div class="gun-row">
          <el-input
            v-model="gunInput"
            placeholder="如 3，回车添加"
            @keyup.enter="addGun"
          />
          <el-button @click="addGun">添加</el-button>
        </div>
        <div class="gun-tags">
          <el-tag
            v-for="g in draftGuns"
            :key="g"
            closable
            type="danger"
            effect="plain"
            @close="removeGun(g)"
          >
            {{ g }} 号枪
          </el-tag>
          <span v-if="draftGuns.length === 0" class="hint">尚未添加油枪</span>
        </div>
      </el-form-item>
      <el-form-item label="停电开始时刻" required>
        <el-input v-model="form.startedAt" type="datetime-local" />
      </el-form-item>
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="纸单号范围 · 起" required>
            <el-input v-model="form.paperStart" placeholder="如 P20260921-1001" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="纸单号范围 · 止" required>
            <el-input v-model="form.paperEnd" placeholder="如 P20260921-1020" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-button type="primary" class="full" @click="submit">登记停电应急台</el-button>
    </el-form>
  </el-card>
</template>

<style scoped>
.mb { margin-bottom: 12px; }
.gun-row { display: flex; gap: 8px; width: 100%; }
.gun-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  width: 100%;
}
.hint { color: #909399; font-size: 13px; }
.full { width: 100%; }
</style>
