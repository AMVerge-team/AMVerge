import { create } from "zustand";

// in-app replacement for the os message boxes (tauri dialog `message`/`confirm`, window.alert/confirm)

export type Notice = {
  id: number;
  title: string;
  message: string;
  /** set for a question: the confirm button's label; a plain notice only has OK */
  confirmLabel?: string;
  resolve: (confirmed: boolean) => void;
};

type NoticeState = { queue: Notice[] };

export const useNoticeStore = create<NoticeState>(() => ({ queue: [] }));

let nextId = 0;

function push(notice: Omit<Notice, "id" | "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    const id = ++nextId;
    useNoticeStore.setState((s) => ({ queue: [...s.queue, { ...notice, id, resolve }] }));
  });
}

/** an OK-only notice; resolves when it is dismissed */
export async function showNotice(title: string, message: string): Promise<void> {
  await push({ title, message });
}

/** a yes/no question; resolves true on confirm, false on cancel or close */
export function askNotice(title: string, message: string, confirmLabel = "OK"): Promise<boolean> {
  return push({ title, message, confirmLabel });
}

/** answers the notice on screen and shows the next one */
export function answerNotice(id: number, confirmed: boolean) {
  const notice = useNoticeStore.getState().queue.find((n) => n.id === id);
  useNoticeStore.setState((s) => ({ queue: s.queue.filter((n) => n.id !== id) }));
  notice?.resolve(confirmed);
}

/** the readable text of a caught error */
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
