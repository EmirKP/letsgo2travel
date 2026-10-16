/** Follow the keyboard's animated viewport, not a fixed delay after focus. */
export function observeSurveyKeyboard(root: HTMLElement) {
  const viewport = window.visualViewport;
  let tallest = Math.max(window.innerHeight, viewport?.height || 0);
  let width = viewport?.width || window.innerWidth;
  let frame = 0;
  let stopped = false;
  const update = () => {
    frame = 0;
    if (stopped) return;
    const field = document.activeElement as HTMLElement | null;
    const editing = !!field && root.contains(field) && field.matches('input:not([type=radio]):not([type=checkbox]),textarea');
    const height = viewport?.height || window.innerHeight;
    const nextWidth = viewport?.width || window.innerWidth;
    // Rotation changes the baseline; it must not look like a keyboard by itself.
    if (Math.abs(nextWidth-width)>80) tallest=Math.max(window.innerHeight,height);
    width=nextWidth;
    tallest = Math.max(tallest, height);
    const keyboard = editing && (document.body?.classList.contains('keyboard-open') || Math.max(tallest, window.innerHeight) - height > 120);
    root.dataset.keyboard = String(keyboard);
    if (!keyboard || !field) return;
    // Layout has just shed its fixed actions. Scroll only this form, never the
    // document or another sheet, so the focused field and first suggestions fit.
    const scroller = root.querySelector<HTMLElement>('.jsv-scroll');
    if (!scroller) return;
    const bounds = scroller.getBoundingClientRect(), box = field.getBoundingClientRect();
    if (box.top < bounds.top + 12 || box.bottom > bounds.bottom - 80) scroller.scrollTop += box.top - bounds.top - 16;
  };
  const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
  root.addEventListener('focusin', schedule);
  root.addEventListener('focusout', schedule);
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  const bodyObserver=typeof MutationObserver==='function'?new MutationObserver(schedule):null;
  if(document.body)bodyObserver?.observe(document.body,{attributes:true,attributeFilter:['class']});
  schedule();
  return () => {
    stopped = true;
    window.cancelAnimationFrame(frame);
    root.removeEventListener('focusin', schedule);
    root.removeEventListener('focusout', schedule);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    bodyObserver?.disconnect();
    delete root.dataset.keyboard;
  };
}

