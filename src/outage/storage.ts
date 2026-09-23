/**
 * 停电应急加油台 —— 保存层
 * 只负责 localStorage 的序列化读写，不做任何业务判定。
 */
import type { OutageState } from "./types";
import { createSeedState } from "./seed";

const STORAGE_KEY = "dfwlfront-7-outage-v1";

export function loadState(): OutageState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as OutageState;
    } catch {
      // 数据损坏时回退到初始演示数据
    }
  }
  return createSeedState();
}

export function saveState(state: OutageState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState(): OutageState {
  const seed = createSeedState();
  saveState(seed);
  return seed;
}
