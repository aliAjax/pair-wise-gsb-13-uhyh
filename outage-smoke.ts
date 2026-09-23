/**
 * 冒烟测试：直接驱动编排层，验证停电应急台关键判定链路。
 * 用全新内存态（不走 localStorage）模拟：登记→手工单→复电→核销→双检→冻结→更正→交班/关班
 */
import { setActivePinia, createPinia } from "pinia";

// localStorage 内存桩
const mem = new Map<string, string>();
(globalThis as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0
} as unknown as Storage;
(globalThis as { crypto?: Crypto }).crypto ??= {
  randomUUID: () => `id-${Math.random().toString(36).slice(2)}`
} as Crypto;

const { useOutageStore } = await import("./src/outage/store");

setActivePinia(createPinia());
const store = useOutageStore();
store.resetDemo();

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.error(`  ✗ ${name} ${extra}`);
    failures++;
  }
}

// 初始：已复电，4 单（1 已核销 / 1 待核销 / 2 待补录）
console.log("[初始种子]");
check("已复电阶段", store.outage?.phase === "POWER_RESTORED");
check("4 条纸单", store.entries.length === 4);
check("待补录 2 条", store.summary.pendingSupplement === 2);
check("待核销 1 条", store.summary.pendingReconcile === 1);

// 未处理完不能关班
const close1 = store.closeShift();
check("有未处理单时不能关班", close1.ok === false);

// 待补录单不能参与核销
const entry3 = store.entries.find((e) => e.id === "entry-seed-3")!;
const rcpt3 = store.receipts.find((r) => r.id === "rcpt-seed-3")!;
const blockedMatch = store.tryReconcile(entry3.id, rcpt3.id);
check("收款空缺单直接匹配被拦截", blockedMatch.ok === false);

// 补录收款（金额与小票一致）后可核销
const supp = store.updateEntry(entry3.id, { amount: 159 }, "车主确认实际收款 159");
check("补录成功", supp.ok);
check("补录后变为待核销", entry3.status === "PENDING_RECONCILE");
const matchOk = store.tryReconcile(entry3.id, rcpt3.id);
check("一致时核销成功", matchOk.ok && entry3.status === "RECONCILED");
check("小票被占用", rcpt3.used && rcpt3.matchedEntryId === entry3.id);

// 金额不符不得核销：entry2 纸单 318，临时造一张 300 的小票
const r2 = store.addReceipt({ gunNo: "4", plateTail: "56F", liters: 40, amount: 300 });
check("录入小票", r2.ok);
const badReceipt = store.receipts.find((x) => x.amount === 300 && !x.used)!;
const entry2 = store.entries.find((e) => e.id === "entry-seed-2")!;
const badMatch = store.tryReconcile(entry2.id, badReceipt.id);
check("金额不符核销被拒", badMatch.ok === false);
check("纸单置为金额不符", entry2.status === "MISMATCH");
check("金额不符小票未被占用", badReceipt.used === false);

// 改配正确小票（318）可成功
const goodMatch = store.tryReconcile(entry2.id, "rcpt-seed-2");
check("改配一致小票核销成功", goodMatch.ok && entry2.status === "RECONCILED");

// 重复单号单（entry4）：更正为新单号 + 收款
const entry4 = store.entries.find((e) => e.id === "entry-seed-4")!;
check("重复单号在留待名单", entry4.holdReasons.includes("重复单号"));
const fix4 = store.updateEntry(entry4.id, { paperNo: "P20260921-1004" }, "核对存根改为 -1004");
check("更正单号成功", fix4.ok && entry4.status === "PENDING_RECONCILE");
const r4 = store.addReceipt({ gunNo: "4", plateTail: "77D", liters: 15, amount: 120 });
check("录入第 4 张小票", r4.ok);
const rcpt4 = store.receipts.find((x) => x.plateTail === "77D" && x.amount === 120)!;
const m4 = store.tryReconcile(entry4.id, rcpt4.id);
check("第 4 单核销成功", m4.ok && entry4.status === "RECONCILED");

// 双检未通过不能恢复
const resume0 = store.resume();
check("双检未通过不能恢复营业", resume0.ok === false);
store.setSelfCheck(true);
const resume1 = store.resume();
check("只过自检不能恢复", resume1.ok === false);
store.setGunReset(true);
const resume2 = store.resume();
check("双检+全核销后恢复并冻结", resume2.ok && store.outage?.frozen === true && store.outage?.phase === "RESUMED");

// 冻结后正常关班
const closeOk = store.closeShift();
check("恢复营业后可正常关班", closeOk.ok);

// 交班承接场景：再来一次冻结后更正关键字段
const correctionsBefore = store.corrections.length;
const noReason = store.updateEntry(entry2.id, { amount: 319 }, "");
check("冻结更正无原因被拒", noReason.ok === false);
const withReason = store.updateEntry(entry2.id, { amount: 319 }, "纸单抄错 1 元，车主付款凭证 319");
check("冻结更正生成原因版本", withReason.ok && store.corrections.length > correctionsBefore);
check("关键字段更正后重新待核销", entry2.status === "PENDING_RECONCILE");
check("原小票被释放", store.receipts.find((r) => r.id === "rcpt-seed-2")?.used === false);

// 冻结后未处理完不能关班（当前无开放班，先验有阻断）
check("有关键更正后需重新匹配", store.summary.pendingReconcile === 1);

console.log(failures === 0 ? "\n全部冒烟用例通过 ✅" : `\n${failures} 条用例失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
