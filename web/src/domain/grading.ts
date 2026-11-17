import type { Assessment, Subject } from './schemas'

export type GradeSummary = {
  value: number | null
  status: 'INSUFFICIENT_DATA' | 'BELOW_TARGET' | 'APPROVAL_REACHED' | 'MANUAL'
  gradedCount: number
}

export function calculateGrade(subject: Subject, assessments: Assessment[]): GradeSummary {
  if (subject.calculationType === 'MANUAL') {
    return { value: null, status: 'MANUAL', gradedCount: 0 }
  }

  const graded = assessments.filter(
    (assessment) =>
      assessment.subjectId === subject.id &&
      assessment.status === 'GRADED' &&
      typeof assessment.grade === 'number' &&
      assessment.grade >= 0 &&
      assessment.grade <= assessment.maximumGrade,
  )

  if (graded.length === 0) {
    return { value: null, status: 'INSUFFICIENT_DATA', gradedCount: 0 }
  }

  let value: number | null = null
  if (subject.calculationType === 'SIMPLE_AVERAGE') {
    value = graded.reduce((sum, item) => sum + Number(item.grade), 0) / graded.length
  } else if (subject.calculationType === 'WEIGHTED_AVERAGE') {
    if (graded.some((item) => typeof item.weight !== 'number' || item.weight <= 0)) {
      return { value: null, status: 'INSUFFICIENT_DATA', gradedCount: graded.length }
    }
    const totalWeight = graded.reduce((sum, item) => sum + Number(item.weight), 0)
    value =
      graded.reduce((sum, item) => sum + Number(item.grade) * Number(item.weight), 0) / totalWeight
  } else {
    value = graded.reduce((sum, item) => sum + Number(item.grade), 0)
  }

  const roundedValue = Math.round((value + Number.EPSILON) * 100) / 100
  const hasPassingRule = subject.knownByStudent && typeof subject.passingGrade === 'number'
  return {
    value: roundedValue,
    status: !hasPassingRule
      ? 'INSUFFICIENT_DATA'
      : roundedValue >= subject.passingGrade
        ? 'APPROVAL_REACHED'
        : 'BELOW_TARGET',
    gradedCount: graded.length,
  }
}
