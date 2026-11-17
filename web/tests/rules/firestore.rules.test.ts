import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

let environment: RulesTestEnvironment

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'cola-comigo-rules-test',
    firestore: {
      rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'),
    },
  })
})

beforeEach(async () => {
  await environment.clearFirestore()
})

afterAll(async () => {
  await environment.cleanup()
})

const validSubject = (ownerId: string) => ({
  ownerId,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  name: 'Matemática',
  color: '#2f7664',
  calculationType: 'SIMPLE_AVERAGE',
  passingGrade: 7,
  maximumGrade: 10,
  expectedAssessmentCount: 4,
  knownByStudent: true,
  status: 'IN_PROGRESS',
  currentAverage: null,
})

describe('isolamento do Firestore', () => {
  it('permite escrita válida apenas no próprio espaço', async () => {
    const database = environment.authenticatedContext('aluno-a').firestore()
    await assertSucceeds(
      setDoc(doc(database, 'users/aluno-a/subjects/mat'), validSubject('aluno-a')),
    )
  })

  it('nega escrita sem autenticação e tentativa de trocar o proprietário', async () => {
    const anonymous = environment.unauthenticatedContext().firestore()
    await assertFails(setDoc(doc(anonymous, 'users/aluno-a/subjects/mat'), validSubject('aluno-a')))
    const database = environment.authenticatedContext('aluno-a').firestore()
    await assertFails(setDoc(doc(database, 'users/aluno-a/subjects/mat'), validSubject('aluno-b')))
  })

  it('impede leitura cruzada entre estudantes', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/aluno-b/subjects/mat'), validSubject('aluno-b'))
    })
    const database = environment.authenticatedContext('aluno-a').firestore()
    await assertFails(getDoc(doc(database, 'users/aluno-b/subjects/mat')))
  })

  it('rejeita dados inválidos e campos inesperados', async () => {
    const database = environment.authenticatedContext('aluno-a').firestore()
    await assertFails(
      setDoc(doc(database, 'users/aluno-a/subjects/invalida'), {
        ...validSubject('aluno-a'),
        maximumGrade: -1,
      }),
    )
    await assertFails(
      setDoc(doc(database, 'users/aluno-a/subjects/privilegio'), {
        ...validSubject('aluno-a'),
        role: 'ADMIN',
      }),
    )
  })

  it('impede trocar o proprietário ou gravar nota acima do limite', async () => {
    const database = environment.authenticatedContext('aluno-a').firestore()
    const subjectRef = doc(database, 'users/aluno-a/subjects/mat')
    await assertSucceeds(setDoc(subjectRef, validSubject('aluno-a')))
    await assertFails(updateDoc(subjectRef, { ownerId: 'aluno-b', updatedAt: serverTimestamp() }))

    const assessmentRef = doc(database, 'users/aluno-a/assessments/prova')
    await assertSucceeds(
      setDoc(assessmentRef, {
        ownerId: 'aluno-a',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        subjectId: 'mat',
        title: 'Prova',
        type: 'EXAM',
        scheduledAt: '2026-12-01T12:00:00.000Z',
        maximumGrade: 10,
        grade: null,
        estimatedStudyMinutes: 45,
        status: 'PLANNED',
      }),
    )
    await assertFails(
      updateDoc(assessmentRef, { grade: 11, status: 'GRADED', updatedAt: serverTimestamp() }),
    )
  })
})
