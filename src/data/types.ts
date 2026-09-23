/**
 * 数据层：停电应急加油台的领域类型与初始数据结构。
 * 只描述“数据长什么样”，不包含任何业务判定与读写逻辑。
 */

/** 停电事件阶段 */
export type EventStage = "停电中" | "已复电" | "已恢复营业";

/** 手工加油单状态 */
export type RecordStatus =
  | "待补录" // 单号重复或收款空缺，留待补录
  | "待匹配" // 资料齐全，等待复电后匹配终端小票
  | "已核销" // 与终端小票匹配且金额一致
  | "金额不符" // 已匹配到小票，但金额不一致，禁止核销
  | "无小票"; // 终端侧查无此单

/** 待补录原因 */
export type PendingReason = "单号重复" | "收款空缺";

/** 复电后终端小票 */
export interface TerminalReceipt {
  slipNo: string;
  plateTail: string;
  nozzle: string;
  liters: number;
  amount: number; // 元
  paidAt: string;
  /** 是否已与手工单核销 */
  matched: boolean;
}

/** 冻结后的更正版本（审计轨迹，原始单不改动） */
export interface CorrectionVersion {
  id: string;
  slipNo: string;
  reason: string;
  /** 更正后的字段；未列出的字段沿用原值 */
  patch: Partial<Pick<ManualRecord, "plateTail" | "nozzle" | "liters" | "amount" | "payment" | "slipNo">>;
  operator: string;
  createdAt: string;
}

/** 停电期间的一条手工加油记录（纸单） */
export interface ManualRecord {
  id: string;
  /** 车牌后三位 */
  plateTail: string;
  /** 枪号 */
  nozzle: string;
  /** 升数 */
  liters: number;
  /** 应收/手工登记金额，元 */
  amount: number;
  /** 实际收款，元；空缺为 null，进入待补录 */
  payment: number | null;
  /** 纸单号 */
  slipNo: string;
  createdAt: string;
  status: RecordStatus;
  /** 进入待补录的原因 */
  pendingReasons: PendingReason[];
  /** 核销时匹配的终端小票号 */
  matchedReceipt?: string;
  /** 金额不符等备注 */
  diffNote?: string;
  /** 更正版本（追加式，最新一条为当前有效值） */
  corrections: CorrectionVersion[];
}

/** 班次交接记录（未处理完不能关班时，下一班写原因承接） */
export interface ShiftHandover {
  id: string;
  shift: string;
  operator: string;
  /** 是否成功关班 */
  closed: boolean;
  /** 无法关班/承接原因 */
  reason: string;
  createdAt: string;
}

/** 停电应急事件（一次台风夜停电 = 一个事件） */
export interface OutageEvent {
  id: string;
  title: string;
  /** 受影响油枪 */
  affectedNozzles: string[];
  /** 停电开始时刻（本地时间 yyyy-MM-ddTHH:mm） */
  startedAt: string;
  /** 纸单号范围 */
  slipFrom: string;
  slipTo: string;
  /** 当前班次 */
  shift: string;
  /** 复电时刻 */
  restoredAt: string | null;
  stage: EventStage;
  /** 设备自检通过 */
  selfCheckPassed: boolean;
  selfCheckNote: string;
  /** 油枪复位通过 */
  nozzleResetPassed: boolean;
  nozzleResetNote: string;
  /** 恢复营业确认时刻；确认后事件冻结 */
  resumedAt: string | null;
  records: ManualRecord[];
  receipts: TerminalReceipt[];
  handovers: ShiftHandover[];
  createdAt: string;
}

/** 保存层落盘的整库结构 */
export interface DeskDatabase {
  version: 1;
  events: OutageEvent[];
  activeEventId: string | null;
}

export const STORAGE_KEY = "dfwl-outage-desk-v1";

export function emptyDatabase(): DeskDatabase {
  return { version: 1, events: [], activeEventId: null };
}
