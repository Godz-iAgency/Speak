import { useCallback, useEffect, useRef, useState } from 'react';

interface PictureInPicture {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
}

export function useFloatingControls(active: boolean) {
  const [pip, setPip] = useState<Window | null>(null);
  const current = useRef<Window | null>(null);
  const generation = useRef(0);
  const api = (window as Window & { documentPictureInPicture?: PictureInPicture }).documentPictureInPicture;
  const open = useCallback(async () => {
    if (!api || current.current) return;
    const request = ++generation.current;
    try {
      const child = await api.requestWindow({ width: 400, height: 110 });
      if (request !== generation.current) { child.close(); return; }
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
        child.document.head.appendChild(node.cloneNode(true));
      });
      child.document.title = 'speak. Recording controls';
      child.document.body.className = 'pip-controls';
      current.current = child;
      setPip(child);
      child.addEventListener('pagehide', () => {
        if (current.current === child) { current.current = null; setPip(null); }
      }, { once: true });
    } catch { /* Unsupported or denied: controls remain in the Speak tab. */ }
  }, [api]);
  useEffect(() => {
    if (!active) {
      generation.current++;
      current.current?.close();
      current.current = null;
    }
  }, [active]);
  useEffect(() => () => {
    generation.current++;
    current.current?.close();
  }, []);
  return { pip: active ? pip : null, open, supported: Boolean(api) };
}
