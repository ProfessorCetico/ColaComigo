import { describe, expect, it } from 'vitest'
import { calculateGrade } from './grading'
import type { Assessment, Subject } from './schemas'

const subject: Subject = {
  id: 'mat',
  name: 'Matemática',
  color: '#2f7664',
  calculationType: 'SIMPLE_AVERAGE',
  passingGrade: 7,
  maximumGrade: 10,
  expectedAssessmentCount: 2,
  knownByStudent: true,
  status: 'IN_PROGRESS',
  currentAverage: null,
}

function assessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    id: 'p1',
    subjectId: 'mat',
    title: 'Prova',
    type: 'EXAM',
    scheduledAt: '2026-12-01T12:00:00.000Z',
    contentDescription: '',
    maximumGrade: 10,
    grade: 8,
    weight: 1,
    estimatedStudyMinutes: 60,
    status: 'GRADED',
    ...overrides,
  }
}

describe('calculateGrade', () => {
  it('calcula média simples e identifica aprovação quando a regra é conhecida', () => {
    const result = calculateGrade(subject, [assessment(), assessment({ id: 'p2', grade: 6 })])
    expect(result.value).toBe(7)
    expect(result.status).toBe('APPROVAL_REACHED')
  })

  it('calcula média ponderada pelos pesos', () => {
    const weighted = { ...subject, calculationType: 'WEIGHTED_AVERAGE' as const }
    const result = calculateGrade(weighted, [
      assessment({ grade: 8, weight: 3 }),
      assessment({ id: 'p2', grade: 4, weight: 1 }),
    ])
    expect(result.value).toBe(7)
  })

  it('não calcula quando não há notas ou há pesos inválidos', () => {
    expect(calculateGrade(subject, []).value).toBeNull()
    const weighted = { ...subject, calculationType: 'WEIGHTED_AVERAGE' as const }
    expect(calculateGrade(weighted, [assessment({ weight: undefined })]).value).toBeNull()
  })

  it('ignora notas fora do intervalo permitido e respeita cálculo manual', () => {
    expect(calculateGrade(subject, [assessment({ grade: 12 })]).value).toBeNull()
    expect(calculateGrade({ ...subject, calculationType: 'MANUAL' }, [assessment()]).status).toBe(
      'MANUAL',
    )
  })

  it('não anuncia aprovação quando o critério não foi confirmado pelo estudante', () => {
    const result = calculateGrade({ ...subject, knownByStudent: false }, [assessment({ grade: 9 })])
    expect(result.status).toBe('INSUFFICIENT_DATA')
  })
})
