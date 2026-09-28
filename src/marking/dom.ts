/**
 * The DOM the page tests touch, typed by hand: tsconfig has no `dom` lib on purpose, so nothing under
 * src/ can reach `document` by accident. happy-dom supplies the real objects at run time
 * (`GlobalRegistrator.register` in each `*-dom.test.ts`). Widen these shapes as a test needs.
 */
export type El = {
  textContent: string | null;
  innerHTML: string;
  hidden: boolean;
  disabled: boolean;
  value: string;
  children: ArrayLike<unknown>;
  classList: { contains: (name: string) => boolean };
  click: () => void;
  getAttribute: (name: string) => string | null;
  querySelector: (selector: string) => El | null;
  querySelectorAll: (selector: string) => Iterable<El> & ArrayLike<El>;
  dispatchEvent: (event: unknown) => boolean;
};
type Doc = Pick<El, "querySelector" | "querySelectorAll"> & { body: El };

export const doc = (): Doc =>
  (globalThis as unknown as { document: Doc }).document;

/** A `keydown` for `key`, from the registered window's own class. */
export const keyEvent = (key: string): unknown => {
  const g = globalThis as unknown as {
    KeyboardEvent: new (type: string, init: { key: string }) => unknown;
  };
  return new g.KeyboardEvent("keydown", { key });
};

/** Polls until fn() is truthy, at most 1 s: page code is async and a fake fetch resolves on later ticks. */
export async function until(fn: () => boolean): Promise<boolean> {
  for (let i = 0; i < 200 && !fn(); i++) await Bun.sleep(5);
  return fn();
}
