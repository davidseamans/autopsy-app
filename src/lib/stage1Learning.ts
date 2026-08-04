import { supabase } from "@/lib/supabase";

export const STAGE1_COURSE_KEY = "getting_your_first_five_jobs";
export const STAGE1_COURSE_VERSION = 1;

export type Stage1LessonProgress = {
  lessonKey: string;
  lessonVersion: number;
  quizScore: number;
  completedAt: string;
};

type LessonProgressRow = {
  lesson_key: string;
  lesson_version: number;
  quiz_score: number;
  completed_at: string;
};

function fromRow(row: LessonProgressRow): Stage1LessonProgress {
  return {
    lessonKey: row.lesson_key,
    lessonVersion: row.lesson_version,
    quizScore: row.quiz_score,
    completedAt: row.completed_at,
  };
}

export async function fetchStage1LearningProgress(runId: string): Promise<Stage1LessonProgress[]> {
  const { data, error } = await supabase
    .from("stage1_learning_progress")
    .select("lesson_key,lesson_version,quiz_score,completed_at")
    .eq("autopsy_run_id", runId)
    .eq("course_key", STAGE1_COURSE_KEY)
    .eq("course_version", STAGE1_COURSE_VERSION);
  if (error) throw new Error(error.message);
  return ((data ?? []) as LessonProgressRow[]).map(fromRow);
}

export async function saveStage1LessonCompletion(input: {
  runId: string;
  lessonKey: string;
  lessonVersion: number;
  quizScore: number;
}): Promise<Stage1LessonProgress> {
  const { data, error } = await supabase.rpc("save_stage1_lesson_completion", {
    p_run_id: input.runId,
    p_course_key: STAGE1_COURSE_KEY,
    p_course_version: STAGE1_COURSE_VERSION,
    p_lesson_key: input.lessonKey,
    p_lesson_version: input.lessonVersion,
    p_quiz_score: input.quizScore,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as LessonProgressRow | null;
  if (!row) throw new Error("Lesson completion was not returned.");
  return fromRow(row);
}
