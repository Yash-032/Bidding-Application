import type { ReactNode } from 'react';
import './design-lab.css';

export default function DesignLabLayout({ children }: { children: ReactNode }) {
  return <div className="design-lab-font-scope">{children}</div>;
}