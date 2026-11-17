import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

if (getApps().length === 0) initializeApp();
const store = getFirestore();

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid)
    throw new HttpsError(
      "unauthenticated",
      "Entre na sua conta para continuar.",
    );
  return auth.uid;
}

export const exportUserData = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const profileRef = store.collection("users").doc(uid);
  const profile = await profileRef.get();
  if (!profile.exists)
    throw new HttpsError("not-found", "Não há perfil para exportar.");

  const exported: Record<string, unknown> = {
    perfil: profile.data(),
    exportadoEm: new Date().toISOString(),
    colecoes: {},
  };
  const collections = await profileRef.listCollections();
  const data: Record<string, unknown[]> = {};
  for (const collection of collections) {
    const snapshot = await collection.get();
    data[collection.id] = snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    }));
  }
  exported.colecoes = data;
  const size = Buffer.byteLength(JSON.stringify(exported), "utf8");
  if (size > 8 * 1024 * 1024) {
    throw new HttpsError(
      "resource-exhausted",
      "Seus dados são grandes demais para exportação direta. Solicite suporte.",
    );
  }
  return exported;
});

export const recordAssessmentGrade = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const payload = z
    .object({
      assessmentId: z
        .string()
        .min(1)
        .max(128)
        .refine((value) => !value.includes("/")),
      grade: z.number().finite().min(0).max(1000),
    })
    .strict()
    .safeParse(request.data);
  if (!payload.success) {
    throw new HttpsError("invalid-argument", "Informe uma nota válida.");
  }

  const assessmentRef = store
    .collection("users")
    .doc(uid)
    .collection("assessments")
    .doc(payload.data.assessmentId);
  const auditRef = store
    .collection("users")
    .doc(uid)
    .collection("auditEvents")
    .doc();

  await store.runTransaction(async (transaction) => {
    const assessment = await transaction.get(assessmentRef);
    if (!assessment.exists || assessment.get("ownerId") !== uid) {
      throw new HttpsError("not-found", "A avaliação não foi encontrada.");
    }
    const maximumGrade = assessment.get("maximumGrade");
    if (typeof maximumGrade !== "number" || payload.data.grade > maximumGrade) {
      throw new HttpsError(
        "invalid-argument",
        "A nota deve respeitar o limite da avaliação.",
      );
    }
    const previousGrade = assessment.get("grade");
    transaction.update(assessmentRef, {
      grade: payload.data.grade,
      status: "GRADED",
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(auditRef, {
      ownerId: uid,
      action: "GRADE_RECORDED",
      entityType: "assessment",
      entityId: assessmentRef.id,
      timestamp: FieldValue.serverTimestamp(),
      metadata: {
        previousGrade: typeof previousGrade === "number" ? previousGrade : null,
        newGrade: payload.data.grade,
      },
    });
  });

  return { recorded: true };
});

export const deleteUserData = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const profileRef = store.collection("users").doc(uid);
  await store.recursiveDelete(profileRef);
  await getAuth().deleteUser(uid);
  return { deleted: true };
});
