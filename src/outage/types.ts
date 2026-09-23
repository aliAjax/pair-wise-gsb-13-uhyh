/**
 * 停电应急加油台 —— 数据层
 * 只描述数据结构，不写任何业务判定与存取逻辑。
 */

/** 停电事件阶段：停电中 / 已复电待核销 / 已恢复营业（数据冻结） */
export type OutagePhase = "ACTIVE" | "POWER_RESTORED" | "RESUMED";

/**
 * 手工加油单状态：
 * PENDING_SUPPLEMENT 待补录（重复单号 / 收款空缺）
 * PENDING_RECONCILE  待核销（复电后与终端小票匹配）
 * RECONCILED         已核销（单号、升数、金额全部一致）
 * MISMATCH           金额不符，不得核销，须更正后重新匹配
 */
export type EntryStatus =
  | "PENDING_SUPPLEMENT"
  | "PENDING_RECONCILE"
  | "RECONCILED"
  | "MISMATCH";

/** 更正原因版本：数据冻结后，任何更正都必须留痕 */
export interface CorrectionVersion {
  id: string;
  createdAt: string;
  operator: string;
  reason: string;
  target: "OUTAGE" | "ENTRY";
  targetId: string;
  field: string;
  before: string;
  after: string;
}

/** 纸单手工加油记录 */
export interface ManualEntry {
  id: string;
  createdAt: string;
  shiftId: string;
  plateTail: string;
  gunNo: string;
  liters: number;
  /** 收款金额；收款空缺时为 null，先留待补录 */
  amount: number | null;
  paperNo: string;
  status: EntryStatus;
  /** 留待补录的原因（重复单号 / 收款空缺） */
  holdReasons: string[];
  /** 非阻断性提示（单号超出纸单范围 / 枪号不在受影响名单等） */
  warnings: string[];
  remark: string;
  supplementNote: string | null;
  supplementAt: string | null;
  reconciledAt: string | null;
  receiptId: string | null;
  lastMatchNote: string | null;
}

/** 复电后终端补传的小票 */
export interface TerminalReceipt {
  id: string;
  createdAt: string;
  gunNo: string;
  plateTail: string;
  liters: number;
  amount: number;
  /** 已用于核销某条手工单 */
  used: boolean;
  matchedEntryId: string | null;
}

/** 停电事件登记 */
export interface OutageEvent {
  id: string;
  phase: OutagePhase;
  affectedGuns: string[];
  startedAt: string;
  paperStart: string;
  paperEnd: string;
  /** 复电时刻 */
  powerRestoredAt: string | null;
  deviceSelfCheckPassed: boolean;
  deviceSelfCheckAt: string | null;
  gunResetPassed: boolean;
  gunResetAt: string | null;
  /** 恢复营业确认时刻，确认即冻结 */
  resumedAt: string | null;
  frozen: boolean;
}

/** 班次：未处理完只能写原因交班，由下一班承接 */
export interface Shift {
  id: string;
  seq: number;
  name: string;
  openedAt: string;
  openedBy: string;
  closedAt: string | null;
  /** null 表示正常关班；有内容表示交班原因（下一班承接） */
  closeReason: string | null;
  carriedFromShiftId: string | null;
}

export interface OutageState {
  version: number;
  operator: string;
  outage: OutageEvent | null;
  entries: ManualEntry[];
  receipts: TerminalReceipt[];
  corrections: CorrectionVersion[];
  shifts: Shift[];
}

/** 录入手工加油单时的表单数据 */
export interface EntryDraft {
  plateTail: string;
  gunNo: string;
  liters: number | null;
  amount: number | null;
  paperNo: string;
  remark: string;
}
