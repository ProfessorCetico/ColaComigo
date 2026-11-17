import { describe, expect, it } from 'vitest'
import { formatInTimeZone } from 'date-fns-tz'
import { generatePlan } from './planner'
import type { Assessment, StudySession, Subject } from './schemas'

const now = new Date('2026-11-16T08:00:00')
const subject: Subject = {
  id: 'hist',
  name: 'História',
  color: '#2f7664',
  calculationType: 'SIMPLE_AVERAGE',
  maximumGrade: 10,
  knownByStudent: false,
  status: 'IN_PROGRESS',
  currentAverage: null,
}
const assessment: Assessment = {
  id: 'a1',
  subjectId: 'hist',
  title: 'Prova',
  type: 'EXAM',
  scheduledAt: '2026-11-23T12:00:00',
  contentDescription: '',
  maximumGrade: 10,
  estimatedStudyMinutes: 90,
  status: 'PLANNED',
}

function plan(overrides: Partial<Parameters<typeof generatePlan>[0]> = {}) {
  return generatePlan({
    now,
    subjects: [subject],
    assessments: [assessment],
    existingSessions: [],
    blockedTimes: [],
    planningDays: 6,
    allowedDays: [0, 1, 2, 3, 4, 5, 6],
    preferredStartTime: '16:00',
    preferredEndTime: '20:00',
    sessionMinutes: 45,
    maxDailyMinutes: 90,
    ...overrides,
  })
}

describe('generatePlan', () => {
  it('distribui o estudo antes da avaliação sem exceder o limite diário', () => {
    const result = plan()
    expect(result.sessions.length).toBeGreaterThan(0)
    expect(
      result.sessions.every(
        (session) => new Date(session.startsAt) < new Date(assessment.scheduledAt),
      ),
    ).toBe(true)
    const dailyMinutes = new Map<string, number>()
    for (const session of result.sessions) {
      const day = session.startsAt.slice(0, 10)
      dailyMinutes.set(day, (dailyMinutes.get(day) ?? 0) + session.plannedMinutes)
    }
    expect([...dailyMinutes.values()].every((minutes) => minutes <= 90)).toBe(true)
  })

  it('respeita compromissos e avisa quando não há espaço suficiente', () => {
    const result = plan({
      planningDays: 2,
      blockedTimes: [
        { startsAt: '2026-11-17T15:00:00', endsAt: '2026-11-17T21:00:00' },
        { startsAt: '2026-11-18T15:00:00', endsAt: '2026-11-18T21:00:00' },
      ],
    })
    expect(result.sessions.every((session) => !session.startsAt.startsWith('2026-11-17'))).toBe(
      true,
    )
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('preserva sessões concluídas e editadas manualmente', () => {
    const completed: StudySession = {
      id: 'done',
      subjectId: 'hist',
      title: 'Revisão concluída',
      startsAt: '2026-11-17T16:00:00',
      endsAt: '2026-11-17T16:30:00',
      plannedMinutes: 30,
      completedMinutes: 30,
      status: 'COMPLETED',
      generatedByPlanner: true,
      manuallyEdited: false,
    }
    const result = plan({ existingSessions: [completed] })
    expect(
      result.sessions.some(
        (session) => session.status === 'COMPLETED' && session.title === completed.title,
      ),
    ).toBe(true)
  })

  it('não cria sessões para disciplina encerrada e mantém resultado determinístico', () => {
    const closedSubject = { ...subject, status: 'COMPLETED' as const }
    const input = { subjects: [closedSubject] }
    const first = plan(input)
    const second = plan(input)
    expect(first).toEqual(second)
    expect(first.sessions).toEqual([])
  })

  it('mantém o horário local correto ao atravessar uma mudança de horário de verão', () => {
    const result = plan({
      now: new Date('2026-03-07T17:00:00.000Z'),
      assessments: [
        { ...assessment, scheduledAt: '2026-03-10T18:00:00.000Z', estimatedStudyMinutes: 45 },
      ],
      timezone: 'America/New_York',
    })
    expect(result.sessions).toHaveLength(1)
    expect(formatInTimeZone(result.sessions[0].startsAt, 'America/New_York', 'HH:mm')).toBe('16:00')
  })

  it('prioriza a disciplina abaixo da meta quando avaliações têm a mesma urgência', () => {
    const result = plan({
      subjects: [
        { ...subject, id: 'hist', currentAverage: 9 },
        { ...subject, id: 'bio', name: 'Biologia', currentAverage: 2 },
      ],
      assessments: [
        { ...assessment, id: 'hist-a', subjectId: 'hist', estimatedStudyMinutes: 45 },
        { ...assessment, id: 'bio-a', subjectId: 'bio', estimatedStudyMinutes: 45 },
      ],
    })
    expect(result.sessions[0]?.subjectId).toBe('bio')
  })
})
