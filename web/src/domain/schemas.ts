import { z } from 'zod'

export const ageRanges = ['UNDER_13', '13_15', '16_17', '18_PLUS'] as const
export const educationLevels = ['FUNDAMENTAL', 'MEDIO', 'TECNICO', 'SUPERIOR', 'OUTRO'] as const
export const shifts = ['MANHA', 'TARDE', 'NOITE', 'INTEGRAL', 'FLEXIVEL'] as const
export const calculationTypes = [
  'SIMPLE_AVERAGE',
  'WEIGHTED_AVERAGE',
  'POINTS_TOTAL',
  'MANUAL',
] as const

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, 'Informe como gostaria de ser chamado(a).').max(60),
  ageRange: z.enum(ageRanges),
  country: z.string().default('BR'),
  state: z.string().trim().length(2, 'Use a sigla de dois caracteres.').toUpperCase(),
  city: z.string().trim().min(2).max(80),
  educationLevel: z.enum(educationLevels),
  institutionName: z.string().trim().max(100).optional().default(''),
  courseName: z.string().trim().min(2).max(100),
  gradeOrTerm: z.string().trim().min(1).max(50),
  schoolShift: z.enum(shifts),
  timezone: z.string().default('America/Sao_Paulo'),
  consentAccepted: z.literal(true, { error: 'É necessário aceitar os termos para continuar.' }),
})

export const subjectSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da disciplina.').max(80),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default('#2f7664'),
  calculationType: z.enum(calculationTypes),
  passingGrade: z.coerce.number().min(0).max(100).optional(),
  maximumGrade: z.coerce.number().gt(0).max(1000).default(10),
  expectedAssessmentCount: z.coerce.number().int().positive().max(100).optional(),
  knownByStudent: z.boolean().default(false),
})

export const assessmentSchema = z.object({
  subjectId: z.string().min(1, 'Selecione uma disciplina.'),
  title: z.string().trim().min(2).max(100),
  type: z.enum(['EXAM', 'QUIZ', 'ASSIGNMENT', 'PRESENTATION', 'PROJECT', 'OTHER']),
  scheduledAt: z.string().min(1, 'Informe a data.'),
  contentDescription: z.string().trim().max(500).default(''),
  weight: z.coerce.number().positive().max(100).optional(),
  maximumGrade: z.coerce.number().positive().max(1000).default(10),
  grade: z.union([z.coerce.number().min(0), z.literal('')]).optional(),
  estimatedStudyMinutes: z.coerce.number().int().min(15).max(600).default(60),
})

export type ProfileInput = z.infer<typeof profileSchema>
export type ProfileFormInput = z.input<typeof profileSchema>
export type SubjectInput = z.infer<typeof subjectSchema>
export type AssessmentInput = z.infer<typeof assessmentSchema>

export type AcademicPeriod = {
  id: string
  name: string
  startDate: string
  endDate: string
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'
}

export type Subject = SubjectInput & {
  id: string
  status: 'NEW' | 'IN_PROGRESS' | 'ATTENTION' | 'APPROVAL_REACHED' | 'COMPLETED' | 'ARCHIVED'
  currentAverage: number | null
  createdAt?: unknown
  updatedAt?: unknown
}

export type Assessment = AssessmentInput & {
  id: string
  status: 'PLANNED' | 'COMPLETED_AWAITING_GRADE' | 'GRADED' | 'CANCELED'
  createdAt?: unknown
  updatedAt?: unknown
}

export type StudySession = {
  id: string
  subjectId: string
  assessmentId?: string
  title: string
  startsAt: string
  endsAt: string
  plannedMinutes: number
  completedMinutes: number
  status: 'PLANNED' | 'COMPLETED' | 'POSTPONED' | 'MISSED' | 'CANCELED'
  generatedByPlanner: boolean
  manuallyEdited: boolean
}
