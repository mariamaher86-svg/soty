// The voice course on the home screen and the path: her level in words, a plain progress bar, what this level
// teaches. Tapping it opens the course map.

import { courseCard, getCourse } from '../lib/course';

export function CourseCard() {
  const c = courseCard(getCourse());
  return (
    <a className="course-card" href="#/course" aria-label={`كورس الصوت: ${c.level}، ${c.done}`}>
      <span className="course-card-head">
        <span className="course-card-icon" aria-hidden>
          🎤
        </span>
        <span>
          <span className="course-card-title">كورس الصوت</span>
          <b className="course-card-level">{c.level}</b>
        </span>
        <span className="chev" aria-hidden>
          ‹
        </span>
      </span>
      <span className="course-bar" aria-hidden>
        <span style={{ width: `${Math.round(c.share * 100)}%` }} />
      </span>
      <span className="course-card-done">{c.done}</span>
      <span className="course-card-teaches">{c.teaches}</span>
    </a>
  );
}
