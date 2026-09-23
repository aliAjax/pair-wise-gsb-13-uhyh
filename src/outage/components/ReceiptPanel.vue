<script setup lang="ts">
/** 复电后终端补传小票录入与占用情况 */
import { reactive } from "vue";
import { ElMessage } from "element-plus";
import { useOutageStore } from "../store";
import { fmtDateTime } from "../format";

const store = useOutageStore();

const form = reactive({
  gunNo: "",
  plateTail: "",
  liters: undefined as number | undefined,
  amount: undefined as number | undefined
});

function submit() {
  const res = store.addReceipt({
    gunNo: form.gunNo,
    plateTail: form.plateTail,
    liters: form.liters === undefined ? null : form.liters,
    amount: form.amount === undefined ? null : form.amount
  });
  if (!res.ok) {
    ElMessage.error(res.error);
    return;
  }
  ElMessage.success("终端小票已录入");
  form.gunNo = "";
  form.plateTail = "";
  form.liters = undefined;
  form.amount = undefined;
}
</script>

<template>
  <el-card shadow="never" class="panel-card">
    <template #header>
      <span class="card-title">④ 终端小票（复电后补传）</span>
    </template>

    <el-form label-position="top" @submit.prevent>
      <el-row :gutter="10">
        <el-col :span="12">
          <el-form-item label="枪号" required>
            <el-select v-model="form.gunNo" placeholder="枪号" allow-create filterable class="full">
              <el-option
                v-for="g in store.outage?.affectedGuns ?? []"
                :key="g"
                :label="`${g} 号枪`"
                :value="g"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="车牌后三位" required>
            <el-input v-model="form.plateTail" maxlength="3" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="10">
        <el-col :span="12">
          <el-form-item label="升数 (L)" required>
            <el-input-number v-model="form.liters" :min="0.01" :precision="2" controls-position="right" class="full" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="金额（元）" required>
            <el-input-number v-model="form.amount" :min="0" :precision="2" controls-position="right" class="full" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-button type="primary" class="full" @click="submit">录入小票</el-button>
    </el-form>

    <el-divider style="margin: 12px 0" />

    <el-table :data="store.receipts" size="small" max-height="260" empty-text="暂无终端小票">
      <el-table-column label="补传时间" width="145">
        <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="枪/车牌" width="90">
        <template #default="{ row }">{{ row.gunNo }}# · {{ row.plateTail }}</template>
      </el-table-column>
      <el-table-column label="升数" width="75">
        <template #default="{ row }">{{ row.liters }}L</template>
      </el-table-column>
      <el-table-column label="金额" width="85">
        <template #default="{ row }">{{ row.amount }}元</template>
      </el-table-column>
      <el-table-column label="状态">
        <template #default="{ row }">
          <el-tag :type="row.used ? 'success' : 'warning'" size="small">
            {{ row.used ? "已核销占用" : "待匹配" }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<style scoped>
.full { width: 100%; }
</style>
