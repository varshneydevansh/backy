/** Keep the document title fitted when its text, available width, or font changes. */
export function watchBlogTitleSize(input: HTMLTextAreaElement): () => void {
  const view = input.ownerDocument.defaultView;
  if (!view) return () => {};
  let frame = 0;
  let active = true;
  let measuredWidth = -1;
  const measure = () => {
    if (!active || !input.getClientRects().length) return;
    const width = input.getBoundingClientRect().width;
    if (!width) return;
    measuredWidth = width;
    const previousHeight = input.style.height;
    input.style.height = 'auto';
    const nextHeight = `${Math.ceil(input.scrollHeight)}px`;
    // Width observation excludes our own height update, and equal measurements
    // restore the existing style instead of introducing a new height mutation.
    input.style.height = nextHeight === previousHeight ? previousHeight : nextHeight;
  };
  const schedule = () => {
    view.cancelAnimationFrame(frame);
    frame = view.requestAnimationFrame(measure);
  };
  const observer = new ResizeObserver(() => {
    if (input.getBoundingClientRect().width !== measuredWidth) schedule();
  });
  observer.observe(input);
  const fonts = input.ownerDocument.fonts;
  fonts?.addEventListener('loadingdone', schedule);
  fonts?.ready.then(() => { if (active) schedule(); });
  schedule();
  return () => {
    active = false;
    view.cancelAnimationFrame(frame);
    observer.disconnect();
    fonts?.removeEventListener('loadingdone', schedule);
  };
}
