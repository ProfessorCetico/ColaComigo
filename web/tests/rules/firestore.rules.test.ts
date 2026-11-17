import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { deleteAccountData, exportAccountData, userDataCollections } from '../../src/lib/account'

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
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/aluno-a'), { ownerId: 'aluno-a' })
    })
    const database = environment.authenticatedContext('aluno-a').firestore()
    await assertFails(setDoc(doc(database, 'users/aluno-a/subjects/mat'), validSubject('aluno-b')))
    const anotherStudent = environment.authenticatedContext('aluno-b').firestore()
    await assertFails(deleteDoc(doc(anotherStudent, 'users/aluno-a')))
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
    await assertSucceeds(
      updateDoc(assessmentRef, { grade: 8, status: 'GRADED', updatedAt: serverTimestamp() }),
    )
    await assertFails(
      updateDoc(assessmentRef, { grade: 11, status: 'GRADED', updatedAt: serverTimestamp() }),
    )
    await assertFails(
      updateDoc(assessmentRef, { grade: 9, status: 'GRADED', updatedAt: serverTimestamp() }),
    )
  })

  it('exporta apenas os dados da conta autenticada', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore()
      await setDoc(doc(database, 'users/aluno-a'), { ownerId: 'aluno-a', displayName: 'Aluno A' })
      await setDoc(doc(database, 'users/aluno-a/subjects/mat'), {
        ownerId: 'aluno-a',
        name: 'Matemática',
      })
    })
    const database = environment.authenticatedContext('aluno-a').firestore()
    const exported = await exportAccountData(database, 'aluno-a')

    expect(exported.perfil.displayName).toBe('Aluno A')
    expect(exported.colecoes.subjects).toEqual([
      { id: 'mat', ownerId: 'aluno-a', name: 'Matemática' },
    ])
  })

  it('exclui as subcoleções e o perfil somente no espaço do titular', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore()
      await setDoc(doc(database, 'users/aluno-a'), { ownerId: 'aluno-a' })
      for (const name of userDataCollections) {
        await setDoc(doc(database, 'users/aluno-a', name, 'registro'), { ownerId: 'aluno-a' })
      }
    })
    const database = environment.authenticatedContext('aluno-a').firestore()
    await deleteAccountData(database, 'aluno-a')

    expect((await getDoc(doc(database, 'users/aluno-a'))).exists()).toBe(false)
    for (const name of userDataCollections) {
      const snapshot = await getDocs(collection(database, 'users', 'aluno-a', name))
      expect(snapshot.empty).toBe(true)
    }
  })
})
