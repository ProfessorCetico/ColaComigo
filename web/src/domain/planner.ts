import { addDays, format, getDay, isAfter, isBefore, parseISO } from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import type { Assessment, StudySession, Subject } from './schemas'

export type BlockedTime = { startsAt: string; endsAt: string }

export type PlannerInput = {
  now: Date
  subjects: Subject[]
  assessments: Assessment[]
  existingSessions: StudySession[]
  blockedTimes: BlockedTime[]
  planningDays: number
  allowedDays: number[]
  preferredStartTime: string
  preferredEndTime: string
  sessionMinutes: number
  maxDailyMinutes: number
  timezone?: string
  dailyMinuteCaps?: Record<string, number>
}

export type PlannerResult = {
  sessions: StudySession[]
  warnings: string[]
}

function priority(assessment: Assessment, subject: Subject, now: Date): number {
  const daysUntil = Math.max(
    0.25,
    (parseISO(assessment.scheduledAt).getTime() - now.getTime()) / 86_400_000,
  )
  const target = Math.max(
    0.1,
    subject.knownByStudent ? (subject.passingGrade ?? subject.maximumGrade) : subject.maximumGrade,
  )
  const performanceGap =
    subject.currentAverage === null
      ? 0.25
      : Math.min(1, Math.max(0, (target - subject.currentAverage) / target))
  const urgency = 1 / daysUntil
  const importance = Math.min(3, Math.max(0.25, assessment.weight ?? 1))
  const effort = 1 + Math.min(0.5, assessment.estimatedStudyMinutes / 600)
  return urgency * (1 + performanceGap) * importance * effort
}

function atTime(day: string, time: string, timezone: string): Date {
  return fromZonedTime(`${day}T${time}:00`, timezone)
}

function overlaps(start: Date, end: Date, block: BlockedTime): boolean {
  const blockedStart = parseISO(block.startsAt)
  const blockedEnd = parseISO(block.endsAt)
  return isBefore(start, blockedEnd) && isAfter(end, blockedStart)
}

export function generatePlan(input: PlannerInput): PlannerResult {
  const timezone = input.timezone ?? 'America/Sao_Paulo'
  const warnings: string[] = []
  const activeSubjects = input.subjects.filter(
    (subject) => !['COMPLETED', 'ARCHIVED'].includes(subject.status),
  )
  const activeIds = new Set(activeSubjects.map((subject) => subject.id))
  const activeById = new Map(activeSubjects.map((subject) => [subject.id, subject]))
  const assessments = input.assessments
    .filter(
      (assessment) =>
        activeIds.has(assessment.subjectId) &&
        assessment.status === 'PLANNED' &&
        isAfter(parseISO(assessment.scheduledAt), input.now),
    )
    .sort((a, b) => {
      const subjectA = activeById.get(a.subjectId)
      const subjectB = activeById.get(b.subjectId)
      if (!subjectA || !subjectB) return 0
      return priority(b, subjectB, input.now) - priority(a, subjectA, input.now)
    })

  const fixedSessions = input.existingSessions.filter(
    (session) =>
      ['COMPLETED', 'CANCELED'].includes(session.status) ||
      session.manuallyEdited ||
      !session.generatedByPlanner,
  )
  const preserved = [...fixedSessions]
  const reserved: BlockedTime[] = [
    ...input.blockedTimes,
    ...fixedSessions
      .filter((session) => session.status !== 'CANCELED')
      .map((session) => ({ startsAt: session.startsAt, endsAt: session.endsAt })),
  ]
  const newSessions: StudySession[] = []
  const dayTotals = new Map<string, number>()
  const zonedToday = formatInTimeZone(input.now, timezone, 'yyyy-MM-dd')
  const [year = 2000, month = 1, date = 1] = zonedToday.split('-').map(Number)
  const calendarAnchor = new Date(year, month - 1, date, 12)

  for (const assessment of assessments) {
    const existingMinutes = input.existingSessions
      .filter(
        (session) =>
          session.assessmentId === assessment.id &&
          ['COMPLETED', 'PLANNED'].includes(session.status),
      )
      .reduce(
        (sum, session) =>
          sum +
          (session.status === 'COMPLETED' ? session.completedMinutes : session.plannedMinutes),
        0,
      )
    const remaining = Math.max(0, assessment.estimatedStudyMinutes - existingMinutes)
    if (remaining === 0) continue

    let minutesToSchedule = remaining
    const due = parseISO(assessment.scheduledAt)
    for (let offset = 1; offset <= input.planningDays && minutesToSchedule > 0; offset += 1) {
      const calendarDay = addDays(calendarAnchor, offset)
      const dayKey = format(calendarDay, 'yyyy-MM-dd')
      if (!input.allowedDays.includes(getDay(calendarDay))) continue
      const dayStart = atTime(dayKey, '00:00', timezone)
      if (!isBefore(dayStart, due)) continue
      let total = dayTotals.get(dayKey) ?? 0
      const dailyLimit = Math.min(
        input.maxDailyMinutes,
        input.dailyMinuteCaps?.[dayKey] ?? input.maxDailyMinutes,
      )
      let cursor = atTime(dayKey, input.preferredStartTime, timezone)
      const windowEnd = atTime(dayKey, input.preferredEndTime, timezone)

      while (
        minutesToSchedule > 0 &&
        total + input.sessionMinutes <= dailyLimit &&
        isBefore(new Date(cursor.getTime() + input.sessionMinutes * 60_000), windowEnd)
      ) {
        const end = new Date(cursor.getTime() + input.sessionMinutes * 60_000)
        const conflict =
          reserved.some((block) => overlaps(cursor, end, block)) ||
          newSessions.some((session) => overlaps(cursor, end, session))
        if (conflict) {
          cursor = new Date(cursor.getTime() + 15 * 60_000)
          continue
        }

        const minutes = Math.min(input.sessionMinutes, minutesToSchedule)
        const sessionEnd = new Date(cursor.getTime() + minutes * 60_000)
        newSessions.push({
          id: `${assessment.id}_${cursor.getTime()}`,
          subjectId: assessment.subjectId,
          assessmentId: assessment.id,
          title: `Estudar para ${assessment.title}`,
          startsAt: cursor.toISOString(),
          endsAt: sessionEnd.toISOString(),
          plannedMinutes: minutes,
          completedMinutes: 0,
          status: 'PLANNED',
          generatedByPlanner: true,
          manuallyEdited: false,
        })
        reserved.push({ startsAt: cursor.toISOString(), endsAt: sessionEnd.toISOString() })
        minutesToSchedule -= minutes
        total += minutes
        cursor = new Date(sessionEnd.getTime() + 15 * 60_000)
      }
      dayTotals.set(dayKey, total)
    }

    if (minutesToSchedule > 0) {
      warnings.push(
        `Não há tempo livre suficiente para estudar para ${assessment.title} antes da avaliação.`,
      )
    }
  }

  return { sessions: [...preserved, ...newSessions], warnings }
}
