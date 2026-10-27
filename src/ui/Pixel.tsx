import { useEffect, useRef, useState } from 'react';
import type { Era } from '../pixel/palettes';
import { Pix } from '../pixel/pix';
import { drawPortrait, lookFor, type Mood } from '../pixel/portrait';
import { drawScene, SCENE_SIZE, type SceneId, type SceneState } from '../pixel/scenes';

/** 全局动画帧：每秒 8 帧，所有像素画面共用一个计时器；“减弱动效”时停在第 0 帧 */
const FPS = 8;
let frame = 0;
const listeners = new Set<(f: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(fn: (f: number) => void) {
  listeners.add(fn);
  if (!timer)
    timer = setInterval(() => {
      if (document.documentElement.dataset.motion === 'reduced' || document.hidden) return;
      frame++;
      for (const l of listeners) l(frame);
    }, 1000 / FPS);
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function useFrame(): number {
  const [f, setF] = useState(frame);
  useEffect(() => subscribe(setF), []);
  return f;
}

/** 世界层场景：320×96 像素，按整数倍放大，像素保持方正 */
export function PixelScene({ scene, state, className, era, label, fit }: { scene: SceneId; state?: SceneState; className?: string; era?: Era; label?: string; fit?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const f = useFrame();
  const key = JSON.stringify(state ?? {});
  // fit：按显示框的宽高比决定画布宽度（高度固定 96 像素），场景向两侧延展而不是被拉伸
  const [w, setW] = useState(SCENE_SIZE.w);
  useEffect(() => {
    const c = ref.current;
    if (!fit || !c) return;
    const ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect();
      if (r.height > 0) setW(Math.max(SCENE_SIZE.w, Math.min(1400, Math.round((SCENE_SIZE.h * r.width) / r.height))));
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, [fit]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const p = new Pix(w, SCENE_SIZE.h);
    drawScene(p, scene, f, { ...(state ?? {}), era });
    c.getContext('2d')!.putImageData(p.toImageData(), 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, scene, key, era, w]);
  return <canvas ref={ref} width={w} height={SCENE_SIZE.h} className={`pixel-scene ${className ?? ''}`} role="img" aria-label={label ?? '场景插画'} />;
}

/** 人物立绘：32×32，会眨眼；talking 时张嘴 */
export function PixelPortrait({ id, era, size = 36, talking, mood, title }: { id: string; era: Era; size?: number; talking?: boolean; mood?: Mood; title?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const f = useFrame();
  // 每个人眨眼的节奏错开
  let seed = 0;
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) & 0xffff;
  const blink = (f + seed) % 29 === 0;
  const talk = talking ? (f + seed) % 2 : 0;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const p = new Pix(32, 32);
    drawPortrait(p, lookFor(id, era), { blink, talk, mood });
    c.getContext('2d')!.putImageData(p.toImageData(), 0, 0);
  }, [id, era, blink, talk, mood]);
  return <canvas ref={ref} width={32} height={32} className="pixel-portrait" style={{ width: size, height: size }} title={title} />;
}
