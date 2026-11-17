import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'

export const userDataCollections = [
  'academicPeriods',
  'subjects',
  'assessments',
  'studySessions',
  'exceptionalEvents',
  'recurringCommitments',
  'trips',
  'planningRuns',
  'auditEvents',
] as const

export async function exportAccountData(firestore: Firestore, uid: string) {
  const profileRef = doc(firestore, 'users', uid)
  const profile = await getDoc(profileRef)
  if (!profile.exists()) throw new Error('Perfil não encontrado.')

  const collections: Record<string, { id: string }[]> = {}
  for (const name of userDataCollections) {
    const snapshot = await getDocs(collection(firestore, 'users', uid, name))
    collections[name] = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }))
  }

  return {
    perfil: profile.data(),
    exportadoEm: new Date().toISOString(),
    colecoes: collections,
  }
}

export async function deleteAccountData(firestore: Firestore, uid: string) {
  for (const name of userDataCollections) {
    const reference = collection(firestore, 'users', uid, name)
    while (true) {
      const snapshot = await getDocs(query(reference, orderBy(documentId()), limit(450)))
      if (snapshot.empty) break

      const batch = writeBatch(firestore)
      snapshot.docs.forEach((item) => batch.delete(item.ref))
      await batch.commit()
    }
  }

  const profileRef = doc(firestore, 'users', uid)
  const profile = await getDoc(profileRef)
  if (profile.exists()) await deleteDoc(profileRef)
}
