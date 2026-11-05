// BB's composer shows its run state only in the submit button's label ("Stop run",
// "Steer current run …"). This mirrors it as data-bui-run="stop" | "steer" onto
// the composer and its timeline panel, so app.css can key the streaming caret and
// the minimized composer off an attribute. A :has() on those ancestors would make
// every DOM change inside the thread re-match it and restyle the whole pane.

const SUBMIT = "[data-promptbox-submit-action]";
const TARGETS = ["[data-follow-up-composer]", "#thread-detail-timeline-panel"];
const ATTRIBUTE = "data-bui-run";

export function runState(label: string | null): "stop" | "steer" | null {
  if (label === "Stop run") return "stop";
  if (label?.startsWith("Steer current run")) return "steer";
  return null;
}

export function mountRunState(): () => void {
  let marked = new Map<Element, string>();
  const sync = () => {
    const next = new Map<Element, string>();
    for (const button of Array.from(document.querySelectorAll(SUBMIT))) {
      const state = runState(button.getAttribute("aria-label"));
      if (state === null) continue;
      for (const selector of TARGETS) {
        const target = button.closest(selector);
        if (target) next.set(target, state);
      }
    }
    for (const target of marked.keys()) if (!next.has(target)) target.removeAttribute(ATTRIBUTE);
    for (const [target, state] of next) if (target.getAttribute(ATTRIBUTE) !== state) target.setAttribute(ATTRIBUTE, state);
    marked = next;
  };
  // Mutation callbacks run before the next style pass, so the attribute lands in
  // the same frame as the label change.
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-label"] });
  sync();
  return () => {
    observer.disconnect();
    for (const target of marked.keys()) target.removeAttribute(ATTRIBUTE);
  };
}
