// A friendly screen instead of a blank white page when a page throws, and the report she can send us.

import { Component, useState, type ReactNode } from 'react';
import { Options } from './ui';
import { clearLog, formatReport, logError, readLog } from '../lib/errorLog';

interface Props {
  children: ReactNode;
  /** whole app: reload; a page: just try it again */
  whole?: boolean;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    logError('render', String((e as Error)?.message ?? e));
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const again = () => (this.props.whole ? window.location.reload() : this.setState({ failed: false }));
    return (
      <div className="panel center crash-screen" role="alert">
        <h2>حصلت مشكلة — دوسي ترجعي</h2>
        <p className="hint">بياناتك زي ما هي. لو اتكررت، ابعتيلنا التقرير من ⚙️ المزيد ← 💾 بياناتك.</p>
        <button className="big primary" onClick={again}>
          🔄 رجّعيها تاني
        </button>
        <a
          className="button-link"
          href="#/"
          onClick={() => {
            this.setState({ failed: false });
          }}
        >
          الرئيسية
        </a>
      </div>
    );
  }
}

/** Errors anywhere else (timers, promises) go to the same log. */
export function installErrorLog() {
  window.addEventListener('error', (e) => logError('error', e.message || 'error'));
  window.addEventListener('unhandledrejection', (e) => logError('rejection', String((e.reason as Error)?.message ?? e.reason)));
}

/** "انسخي التقرير" under المزيد → بياناتك. */
export function ErrorReport() {
  const [entries, setEntries] = useState(() => readLog());
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const report = () => formatReport(entries, `${navigator.userAgent.match(/\(([^)]+)\)/)?.[1] ?? ''} ${new Date().toISOString().slice(0, 10)}`);
  const copy = async () => {
    const t = report();
    try {
      await navigator.clipboard.writeText(t);
      setCopied(true);
    } catch {
      setText(t); // no clipboard: show it to copy by hand
    }
  };
  return (
    <Options label={`🧾 تقرير الأعطال (${entries.length})`}>
      <p className="hint">آخر {entries.length} مشكلة حصلت في التطبيق: نوعها والصفحة والوقت بس، من غير أي بيانات شخصية، ومتخزن على الجهاز ده بس. لو التطبيق قفل منك، انسخيه وابعتيه لنا.</p>
      <div className="row">
        <button onClick={() => void copy()}>{copied ? '✔ اتنسخ' : '📋 انسخي التقرير'}</button>
        {entries.length > 0 && (
          <button
            className="link"
            onClick={() => {
              clearLog();
              setEntries([]);
              setText('');
            }}
          >
            امسحي التقرير
          </button>
        )}
      </div>
      {text && <textarea readOnly dir="ltr" rows={6} value={text} style={{ width: '100%' }} onFocus={(e) => e.target.select()} />}
    </Options>
  );
}
