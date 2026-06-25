import type { Course, Lesson } from '../types'
import { lesson1 } from './lessons/lesson1'
import { lesson2 } from './lessons/lesson2'
import { lesson3 } from './lessons/lesson3'
import { lesson4 } from './lessons/lesson4'
import { lesson5 } from './lessons/lesson5'
import { lesson6 } from './lessons/lesson6'
import { lesson7 } from './lessons/lesson7'

// Single typed entry point for all lesson content. Local for Phase 1;
// the same API can later be backed by Firestore or AI-generated lessons.
const LESSONS: Lesson[] = [lesson1, lesson2, lesson3, lesson4, lesson5, lesson6, lesson7]

const lessonsById = new Map<string, Lesson>(LESSONS.map((lesson) => [lesson.id, lesson]))

export const course: Course = {
  id: 'programming-logic',
  title: 'Programming Logic',
  description:
    'Master sequencing, for-loops, while-loops, and if/else, turn your loops into a counting calculator, then take on real algorithm challenges.',
  // The teaching order: build sequencing, then loops, then branching, then a
  // capstone, then the counter calculator. This array is the source of truth
  // for ordering and lesson gating across the app.
  lessonOrder: [
    'lesson-1-sequencing-cargo',
    'lesson-2-for-loops',
    'lesson-3-while-loops',
    'lesson-4-if-else',
    'lesson-5-final-challenge',
    'lesson-6-counter-code',
    'lesson-7-challenges',
  ],
}

// Lessons in the course's teaching order — keeps the roadmap UI and the
// `lessonOrder` gating perfectly in sync.
export function listLessons(): Lesson[] {
  return course.lessonOrder.map((id) => lessonsById.get(id)).filter((l): l is Lesson => l !== undefined)
}

export function getLesson(id: string): Lesson | undefined {
  return lessonsById.get(id)
}

export function getNextLessonId(currentId: string): string | null {
  const index = course.lessonOrder.indexOf(currentId)
  if (index === -1 || index + 1 >= course.lessonOrder.length) {
    return null
  }
  return course.lessonOrder[index + 1]
}
