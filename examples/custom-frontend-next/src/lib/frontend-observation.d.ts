export interface FrontendDomCapture {
  schemaVersion: 'backy.frontend-dom-capture.v1';
  observation: null | {
    siteId: string; route: string; frontendId: string; frontendVersion: string; revision?: string;
    breakpoint: 'desktop' | 'tablet' | 'mobile'; complete: boolean;
    domCapture: { schemaVersion: 'backy.frontend-dom-evidence.v1'; source: 'browser-dom'; capturedAt: string; viewport: { width: number; height: number }; expectedCount: number; capturedCount: number; limitations: string[] };
    elements: Array<{ id: string; type?: string; parentId: string | null; fields?: Record<string, number>; dom: { rect: { x: number; y: number; width: number; height: number }; visibility: 'rendered' | 'hidden'; positioning: 'absolute' | 'fixed' | 'relative' | 'static' | 'sticky' | 'unknown'; transformed: boolean } }>;
  };
  unverifiedDom?: Pick<NonNullable<FrontendDomCapture['observation']>, 'breakpoint' | 'elements' | 'domCapture'>;
  limitations: string[];
  evidence: string;
}
export function captureBackyFrontendDom(root: HTMLElement, options?: { expectedIds?: string[]; maxElements?: number }): FrontendDomCapture;
