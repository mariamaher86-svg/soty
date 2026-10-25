// "مش فاهمة يعني إيه مقام؟ ← درس المقام": a small link from a feature page to the matching basics lesson.

import { lessonById, type LessonId } from '../content/lessons';
import { g } from '../lib/gender';
import { getLessonsDone } from '../lib/storage';

export function LessonLink({ id, what }: { id: LessonId; what: string }) {
  const l = lessonById(id)!;
  const done = !!getLessonsDone()[id];
  return (
    <p className="hint lesson-link">
      {g('مش فاهمة', 'مش فاهم')} يعني إيه {what}؟{' '}
      <a href={`#/lessons/${id}`}>
        ← درس "{l.title}" {done ? '✔' : ''}
      </a>
    </p>
  );
}
