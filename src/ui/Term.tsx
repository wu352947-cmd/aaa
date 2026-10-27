import type { ReactNode } from 'react';
import { GLOSSARY } from './format';

export function Term({ k, children }: { k: string; children?: ReactNode }) {
  return (
    <span className="term" title={GLOSSARY[k] ?? ''}>
      {children ?? k}
    </span>
  );
}
