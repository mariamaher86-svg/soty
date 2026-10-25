import { Page } from '../components/ui';
import { LessonLink } from '../components/LessonLink';
import { KeyDetector } from '../components/KeyDetector';
import { setPref } from '../lib/storage';

/** Stand-alone "detect the maqam" page; "use it" opens the YouTube sing-along with that key. */
export function KeyPage() {
  return (
    <Page tips mic help="key" title="اكتشف المقام">
      <LessonLink id="maqam" what="مقام أو سلم" />
      <KeyDetector
        onUse={(tonic, scaleId) => {
          setPref('yt.tonic', String(tonic));
          setPref('yt.scale', scaleId);
          setPref('sing.mode', 'youtube');
          window.location.hash = '#/sing';
        }}
      />
    </Page>
  );
}
