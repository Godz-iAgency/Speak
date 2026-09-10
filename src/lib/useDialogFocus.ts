import { useEffect, useRef, type RefObject } from 'react';
/** Keep keyboard focus inside an open dialog and return it to its opener. */
export function useDialogFocus(open: boolean, close: () => void, disabled = false): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const latest = useRef({close,disabled});
  useEffect(() => {latest.current={close,disabled};}, [close,disabled]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog=ref.current;
    if (!dialog) return;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')];
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key==='Escape' && !latest.current.disabled) {event.preventDefault();latest.current.close();}
      if (event.key!=='Tab') return;
      const items=focusable(); const first=items[0],last=items.at(-1);
      if (!first) {event.preventDefault();return;}
      if(event.shiftKey && (document.activeElement===first || !dialog.contains(document.activeElement))) {event.preventDefault();last?.focus();}
      else if(!event.shiftKey && (document.activeElement===last || !dialog.contains(document.activeElement))) {event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',keydown);
    const overflow=document.body.style.overflow; document.body.style.overflow='hidden';
    return () => {document.removeEventListener('keydown',keydown);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  }, [open]);
  return ref;
}
