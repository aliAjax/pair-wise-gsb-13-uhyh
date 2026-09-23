<script setup lang="ts">
/** 手工加油：车牌后三位、枪号、升数、收款、纸单号；重复单号或收款空缺先留待补录 */
import { reactive } from "vue";
import { ElMessage } from "element-plus";
import { useOutageStore } from "../store";

const store = useOutageStore();

const form = reactive({
  plateTail: "",
  gunNo: "",
  liters: undefined as number | undefined,
  amount: undefined as number | undefined,
  paperNo: "",
  remark: ""
});

function reset() {
  form.plateTail = "";
  form.gunNo = "";
  form.liters = undefined;
  form.amount = undefined;
  form.paperNo = "";
  form.remark = "";
}

function submit() {
  const res = store.addEntry({
    plateTail: form.plateTail,
    gunNo: form.gunNo,
    liters: form.liters === undefined ? null : form.liters,
    amount: form.amount === undefined ? null : form.amount,
    paperNo: form.paperNo,
    remark: form.remark
  });
  if (!res.ok) {
    ElMessage.error(res.error);
    return;
  }
  if (res.holdReasons && res.holdReasons.length > 0) {
    ElMessage.warning(`纸单已先留待补录：${res.holdReasons.join("、")}`);
  } else {
    ElMessage.success("纸单已记录，复电后可参与小票匹配核销");
  }
  reset();
}
</script>

<template>
  <el-card shadow="never" class="panel-card">
    <template #header>
      <span class="card-title">② 手工加油纸单</span>
    </template>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="收款空缺或纸单号重复时不要硬填，系统会先留待补录；枪号、单号异常只作提示不拦截。"
      class="mb"
    />
    <el-form label-position="top" @submit.prevent>
      <el-row :gutter="10">
        <el-col :span="12">
          <el-form-item label="车牌后三位" required>
            <el-input v-model="form.plateTail" maxlength="3" placeholder="如 8A3" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="枪号" required>
            <el-select
              v-model="form.gunNo"
              placeholder="受影响油枪"
              allow-create
              filterable
              class="full"
            >
              <el-option
                v-for="g in store.outage?.affectedGuns ?? []"
                :key="g"
                :label="`${g} 号枪`"
                :value="g"
              />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="10">
        <el-col :span="12">
          <el-form-item label="升数 (L)" required>
            <el-input-number
              v-model="form.liters"
              :min="0.01"
              :precision="2"
              :step="1"
              controls-position="right"
              class="full"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="收款（元，留空=收款空缺）">
            <el-input-number
              v-model="form.amount"
              :min="0"
              :precision="2"
              :step="10"
              controls-position="right"
              class="full"
            />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="纸单号" required>
        <el-input v-model="form.paperNo" placeholder="使用登记范围内的纸单号" />
      </el-form-item>
      <el-form-item label="现场备注">
        <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="如：现金当面点清 / 扫码待确认" />
      </el-form-item>
      <el-button type="primary" class="full" @click="submit">记录纸单</el-button>
    </el-form>
  </el-card>
</template>

<style scoped>
.mb { margin-bottom: 12px; }
.full { width: 100%; }
</style>
