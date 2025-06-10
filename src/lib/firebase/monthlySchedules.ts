
/**
 * @fileOverview Módulo para interactuar con la colección 'monthlySchedules' en Firebase Firestore.
 * Proporciona funciones para gestionar horarios mensuales, incluyendo la creación, lectura,
 * actualización de borradores, publicación de horarios, y archivado de versiones anteriores.
 * Maneja la lógica de estados ('draft', 'published', 'archived') y versionado.
 */

import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  writeBatch,
  Timestamp,
  orderBy,
  limit,
  serverTimestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  getDoc,
} from 'firebase/firestore';
import { db } from './config';
import type { MonthlySchedule, AIShift, ScheduleViolation, ScoreBreakdown } from '@/lib/types';
import { cleanDataForFirestore } from '@/lib/utils';
import { format, addMonths } from 'date-fns';

/** Nombre de la colección de horarios mensuales en Firestore. */
const MONTHLY_SCHEDULES_COLLECTION = 'monthlySchedules';

/**
 * Genera una clave única para un horario basada en el año, mes y ID del servicio.
 *
 * @param {string} year - El año del horario (ej. "2024").
 * @param {string} month - El mes del horario (ej. "1" para Enero, "12" para Diciembre).
 * @param {string} serviceId - El ID del servicio.
 * @returns {string} La clave generada en formato `YYYY-MM-ServiceID`.
 */
export const generateScheduleKey = (year: string, month: string, serviceId: string): string => {
  return `${year}-${String(month).padStart(2, '0')}-${serviceId}`;
};

/**
 * Convierte un documento de Firestore (`QueryDocumentSnapshot`) a un objeto de tipo `MonthlySchedule`.
 * Maneja la conversión de Timestamps de Firestore a milisegundos y la asignación de valores por defecto.
 *
 * @param {QueryDocumentSnapshot<DocumentData>} snapshot - El snapshot del documento de Firestore.
 * @returns {MonthlySchedule} El objeto de horario mensual convertido.
 */
const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): MonthlySchedule => {
    const data = snapshot.data();
    // console.log(`[fromFirestore] Processing doc ID: ${snapshot.id}, scheduleKey: ${data.scheduleKey}, status: ${data.status}, version: ${data.version}`);
    return {
        id: snapshot.id,
        scheduleKey: data.scheduleKey,
        year: data.year,
        month: data.month,
        serviceId: data.serviceId,
        serviceName: data.serviceName,
        shifts: data.shifts || [],
        status: data.status || 'archived', 
        version: data.version || 0,
        responseText: data.responseText,
        score: data.score,
        violations: data.violations || [],
        scoreBreakdown: data.scoreBreakdown ? { serviceRules: data.scoreBreakdown.serviceRules, employeeWellbeing: data.scoreBreakdown.employeeWellbeing } : undefined,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (typeof data.createdAt === 'number' ? data.createdAt : 0),
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : (typeof data.updatedAt === 'number' ? data.updatedAt : 0),
    } as MonthlySchedule;
};

/**
 * Obtiene el horario mensual publicado (activo) para un servicio, mes y año específicos.
 * Busca el horario con `status: 'published'` y la versión más reciente.
 *
 * @async
 * @param {string} year - El año del horario.
 * @param {string} month - El mes del horario.
 * @param {string} serviceId - El ID del servicio.
 * @returns {Promise<MonthlySchedule | null>} Una promesa que se resuelve con el horario publicado, o `null` si no se encuentra.
 * @throws {Error} Si ocurre un error durante la obtención de datos.
 */
export const getPublishedMonthlySchedule = async (
  year: string,
  month: string,
  serviceId: string
): Promise<MonthlySchedule | null> => {
  if (!year || !month || !serviceId) {
    console.warn("getPublishedMonthlySchedule called with invalid parameters", { year, month, serviceId });
    return null;
  }
  const scheduleKey = generateScheduleKey(year, month, serviceId);
  const schedulesCol = collection(db, MONTHLY_SCHEDULES_COLLECTION);
  const q = query(
    schedulesCol,
    where('scheduleKey', '==', scheduleKey),
    where('status', '==', 'published'),
    orderBy('version', 'desc'), 
    limit(1)
  );

  try {
    const snapshot = await getDocs(q);
    // console.log(`[getPublishedMonthlySchedule] For key ${scheduleKey}, query found ${snapshot.docs.length} docs with status 'published'. Docs:`, snapshot.docs.map(d => ({id: d.id, version: d.data().version, status: d.data().status})));
    if (snapshot.empty) {
      return null;
    }
    return fromFirestore(snapshot.docs[0]);
  } catch (error) {
    console.error("Error fetching published monthly schedule for key:", scheduleKey, "Actual error:", error);
    throw new Error(`Error fetching published schedule for ${scheduleKey}: ${(error as Error).message}`);
  }
};

/**
 * Obtiene el horario mensual en estado de borrador más reciente para un servicio, mes y año específicos.
 * Busca el horario con `status: 'draft'` y el `updatedAt` más reciente.
 *
 * @async
 * @param {string} year - El año del horario.
 * @param {string} month - El mes del horario.
 * @param {string} serviceId - El ID del servicio.
 * @returns {Promise<MonthlySchedule | null>} Una promesa que se resuelve con el borrador del horario, o `null` si no se encuentra.
 * @throws {Error} Si ocurre un error durante la obtención de datos.
 */
export const getDraftMonthlySchedule = async (
  year: string,
  month: string,
  serviceId: string
): Promise<MonthlySchedule | null> => {
  if (!year || !month || !serviceId) {
    console.warn("getDraftMonthlySchedule called with invalid parameters", { year, month, serviceId });
    return null;
  }
  const scheduleKey = generateScheduleKey(year, month, serviceId);
  const schedulesCol = collection(db, MONTHLY_SCHEDULES_COLLECTION);
  const q = query(
    schedulesCol,
    where('scheduleKey', '==', scheduleKey),
    where('status', '==', 'draft'),
    orderBy('updatedAt', 'desc'), 
    limit(1)
  );

  try {
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }
    return fromFirestore(snapshot.docs[0]);
  } catch (error) {
    console.error("Error fetching draft monthly schedule for key:", scheduleKey, "Actual error:", error);
    throw new Error(`Error fetching draft schedule for ${scheduleKey}: ${(error as Error).message}`);
  }
};

/**
 * Obtiene todos los horarios publicados dentro de un rango de fechas (mes/año inicio a mes/año fin).
 * Puede filtrar opcionalmente por un ID de servicio específico.
 *
 * @async
 * @param {string} yearFrom - Año de inicio del rango.
 * @param {string} monthFrom - Mes de inicio del rango.
 * @param {string} yearTo - Año de fin del rango.
 * @param {string} monthTo - Mes de fin del rango.
 * @param {string} [serviceId] - ID opcional del servicio para filtrar. Si es "__ALL_SERVICES_COMPARISON__" o no se proporciona, se obtienen para todos los servicios.
 * @returns {Promise<MonthlySchedule[]>} Una promesa que se resuelve con un array de horarios publicados.
 */
export const getSchedulesInDateRange = async (
  yearFrom: string,
  monthFrom: string,
  yearTo: string,
  monthTo: string,
  serviceId?: string
): Promise<MonthlySchedule[]> => {
  const allSchedules: MonthlySchedule[] = [];
  const startDate = new Date(parseInt(yearFrom), parseInt(monthFrom) - 1, 1);
  const endDate = new Date(parseInt(yearTo), parseInt(monthTo) - 1, 1);
  let currentDate = startDate;

  const schedulesCol = collection(db, MONTHLY_SCHEDULES_COLLECTION);

  while (currentDate <= endDate) {
    const currentYearStr = format(currentDate, 'yyyy');
    const currentMonthStr = format(currentDate, 'M'); 

    let q;
    if (serviceId && serviceId !== "__ALL_SERVICES_COMPARISON__") {
      const scheduleKey = generateScheduleKey(currentYearStr, currentMonthStr, serviceId);
      q = query(
        schedulesCol,
        where('scheduleKey', '==', scheduleKey),
        where('status', '==', 'published'), 
        orderBy('version', 'desc'),
        limit(1)
      );
    } else {
      q = query(
        schedulesCol,
        where('year', '==', currentYearStr),
        where('month', '==', currentMonthStr),
        where('status', '==', 'published') 
        // Consider adding orderBy version here if multiple services could have published schedules for the same month/year
        // and you only want the latest version for each. However, the current logic seems to imply
        // fetching all published schedules for all services in that month if serviceId is not specific.
      );
    }

    try {
      const snapshot = await getDocs(q);
      snapshot.forEach(doc => {
        allSchedules.push(fromFirestore(doc));
      });
    } catch (error) {
      console.error("Error fetching schedules in date range for year:", currentYearStr, "month:", currentMonthStr, "serviceId:", serviceId, "Actual error:", error);
    }
    currentDate = addMonths(currentDate, 1);
  }
  return allSchedules;
};

/**
 * Guarda o actualiza un horario mensual como borrador.
 * Si se proporciona `existingDraftIdToUpdate`, actualiza ese borrador.
 * De lo contrario, busca un borrador existente para la misma `scheduleKey` y lo actualiza,
 * o crea uno nuevo si no existe.
 *
 * @async
 * @param {Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'status'>} scheduleData - Los datos del horario a guardar como borrador.
 * @param {string} [existingDraftIdToUpdate] - El ID opcional de un borrador existente para actualizar directamente.
 * @returns {Promise<MonthlySchedule>} Una promesa que se resuelve con el horario borrador guardado o actualizado.
 * @throws {Error} Si falla la operación de guardado/actualización.
 */
export const saveOrUpdateDraftSchedule = async (
  scheduleData: Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'status'>,
  existingDraftIdToUpdate?: string
): Promise<MonthlySchedule> => {
  const schedulesCol = collection(db, MONTHLY_SCHEDULES_COLLECTION);
  const scheduleKey = generateScheduleKey(scheduleData.year, scheduleData.month, scheduleData.serviceId);

  const dataToSave = {
      ...scheduleData,
      scheduleKey,
      scoreBreakdown: scheduleData.scoreBreakdown ? { serviceRules: scheduleData.scoreBreakdown.serviceRules, employeeWellbeing: scheduleData.scoreBreakdown.employeeWellbeing } : undefined,
      status: 'draft' as const, 
      updatedAt: serverTimestamp(),
  };
  
  let draftIdToReturn = existingDraftIdToUpdate;
  let versionToReturn = 1; 
  let createdAtToReturn: number | Timestamp = serverTimestamp(); // Initialize with serverTimestamp for new docs

  try {
    if (existingDraftIdToUpdate) {
      const draftDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, existingDraftIdToUpdate);
      const existingDocSnap = await getDoc(draftDocRef);
      if (existingDocSnap.exists()) {
          versionToReturn = existingDocSnap.data().version || 1; 
          createdAtToReturn = existingDocSnap.data().createdAt || serverTimestamp(); // Preserve original createdAt
      }
      const updatePayload = { ...dataToSave, version: versionToReturn, createdAt: createdAtToReturn }; 
      await updateDoc(draftDocRef, cleanDataForFirestore(updatePayload));
    } else {
      // Check if a draft already exists for this scheduleKey to update it
      const q = query(schedulesCol, where('scheduleKey', '==', scheduleKey), where('status', '==', 'draft'), limit(1));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) { 
        const existingDoc = snapshot.docs[0];
        draftIdToReturn = existingDoc.id;
        versionToReturn = existingDoc.data().version || 1; // Use existing draft's version
        createdAtToReturn = existingDoc.data().createdAt || serverTimestamp(); // Preserve original createdAt
        await updateDoc(existingDoc.ref, cleanDataForFirestore({ ...dataToSave, version: versionToReturn, createdAt: createdAtToReturn }));
      } else { 
        // No existing draft, create a new one with version 1
        const newDocRef = await addDoc(schedulesCol, cleanDataForFirestore({ ...dataToSave, version: 1, createdAt: serverTimestamp() }));
        draftIdToReturn = newDocRef.id;
        versionToReturn = 1;
        // createdAtToReturn is already serverTimestamp()
      }
    }

    const finalCreatedAt = createdAtToReturn instanceof Timestamp ? Date.now() : createdAtToReturn; // Approx if serverTimestamp was used

    return {
      id: draftIdToReturn!, 
      ...scheduleData,
      status: 'draft',
      version: versionToReturn,
      createdAt: finalCreatedAt,
      updatedAt: Date.now(), // Approx client time for immediate feedback
    };

  } catch (error) {
      console.error("Error saving or updating draft schedule:", error);
      throw new Error(`Failed to save/update draft schedule: ${(error as Error).message}`);
  }
};

/**
 * Publica un horario.
 * 1. Archiva cualquier horario previamente publicado para la misma `scheduleKey`.
 * 2. Si se proporciona `draftIdBeingPublished`, archiva ese borrador.
 * 3. Guarda el nuevo horario con `status: 'published'` y una versión incrementada.
 *
 * @async
 * @param {Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'status'>} scheduleDataToPublish - Los datos del horario a publicar.
 * @param {string} [draftIdBeingPublished] - El ID opcional del borrador que se está publicando.
 * @returns {Promise<MonthlySchedule>} Una promesa que se resuelve con el horario recién publicado.
 * @throws {Error} Si falla la operación de publicación.
 */
export const publishSchedule = async (
  scheduleDataToPublish: Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'status'>,
  draftIdBeingPublished?: string 
): Promise<MonthlySchedule> => {
  const batch = writeBatch(db);
  const schedulesCol = collection(db, MONTHLY_SCHEDULES_COLLECTION);
  const scheduleKey = generateScheduleKey(scheduleDataToPublish.year, scheduleDataToPublish.month, scheduleDataToPublish.serviceId);

  let newVersion = 1;

  // 1. Archive previously published schedule for this key
  const publishedQuery = query(
    schedulesCol,
    where('scheduleKey', '==', scheduleKey),
    where('status', '==', 'published'),
    limit(1) // Should only be one, but limit for safety
  );
  const publishedSnapshot = await getDocs(publishedQuery);
  if (!publishedSnapshot.empty) {
    const oldPublishedDoc = publishedSnapshot.docs[0];
    newVersion = (oldPublishedDoc.data().version || 0) + 1;
    batch.update(oldPublishedDoc.ref, { status: 'archived', updatedAt: serverTimestamp() });
  } else {
    // If no previously published, determine newVersion based on any existing version for this key
     const versionQuery = query(
        schedulesCol,
        where('scheduleKey', '==', scheduleKey),
        orderBy('version', 'desc'),
        limit(1)
    );
    const versionSnapshot = await getDocs(versionQuery);
    if (!versionSnapshot.empty) {
        newVersion = (versionSnapshot.docs[0].data().version || 0) + 1;
    }
    // If no schedules at all for this key, newVersion remains 1
  }
  
  // 2. Archive the draft that is being published, if applicable
  if (draftIdBeingPublished) {
    const draftDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, draftIdBeingPublished);
    const draftSnap = await getDoc(draftDocRef);
    if (draftSnap.exists()) {
        batch.update(draftDocRef, { status: 'archived', updatedAt: serverTimestamp() });
    } else {
        console.warn(`Draft with ID ${draftIdBeingPublished} not found while trying to archive it during publish.`);
    }
  }

  // 3. Create the new published schedule
  const newPublishedDocRef = doc(collection(db, MONTHLY_SCHEDULES_COLLECTION)); // Auto-generate ID
  const newScheduleForDb = {
    ...scheduleDataToPublish,
    scheduleKey,
    scoreBreakdown: scheduleDataToPublish.scoreBreakdown ? { serviceRules: scheduleDataToPublish.scoreBreakdown.serviceRules, employeeWellbeing: scheduleDataToPublish.scoreBreakdown.employeeWellbeing } : undefined,
    status: 'published' as const,
    version: newVersion,
    createdAt: serverTimestamp(), // New creation timestamp for this published version
    updatedAt: serverTimestamp(),
  };

  batch.set(newPublishedDocRef, cleanDataForFirestore(newScheduleForDb));

  try {
    await batch.commit();
    const nowMillis = Date.now(); // Approximate client time for immediate feedback
    return {
      id: newPublishedDocRef.id,
      ...scheduleDataToPublish,
      status: 'published',
      version: newVersion,
      createdAt: nowMillis, 
      updatedAt: nowMillis, 
    };
  } catch (error) {
    console.error("Error publishing schedule:", error);
    throw new Error(`Failed to publish schedule: ${(error as Error).message}`);
  }
};

/**
 * Actualiza un horario publicado existente directamente.
 * Esto implica archivar la versión actual y crear una nueva versión publicada con los cambios.
 * Esencialmente, es una forma de "republicar" con modificaciones.
 *
 * @async
 * @param {string} scheduleId - El ID del horario publicado a actualizar.
 * @param {Partial<Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'scheduleKey' | 'year' | 'month' | 'serviceId' | 'serviceName'>>} scheduleData - Los datos a actualizar.
 * @returns {Promise<MonthlySchedule>} Una promesa que se resuelve con la nueva versión del horario publicado.
 * @throws {Error} Si el horario no se encuentra, no está publicado, o si falla la actualización.
 */
export const updatePublishedScheduleDirectly = async ( 
  scheduleId: string, 
  scheduleData: Partial<Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'scheduleKey' | 'year' | 'month' | 'serviceId' | 'serviceName'>>
): Promise<MonthlySchedule> => {
  const batch = writeBatch(db);
  const publishedDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, scheduleId);
  const publishedDocSnap = await getDoc(publishedDocRef);
  
  if (!publishedDocSnap.exists() || publishedDocSnap.data().status !== 'published') {
      throw new Error(`Schedule with ID ${scheduleId} not found or is not published.`);
  }
  // Important: Reconstruct the old data from Firestore snapshot to ensure correct types
  const oldPublishedDataFirestore = publishedDocSnap.data();
   const oldPublishedData: MonthlySchedule = {
    id: publishedDocSnap.id,
    scheduleKey: oldPublishedDataFirestore.scheduleKey,
    year: oldPublishedDataFirestore.year,
    month: oldPublishedDataFirestore.month,
    serviceId: oldPublishedDataFirestore.serviceId,
    serviceName: oldPublishedDataFirestore.serviceName,
    shifts: oldPublishedDataFirestore.shifts || [],
    status: oldPublishedDataFirestore.status, // This will be 'published'
    version: oldPublishedDataFirestore.version || 0,
    responseText: oldPublishedDataFirestore.responseText,
    score: oldPublishedDataFirestore.score,
    violations: oldPublishedDataFirestore.violations || [],
    scoreBreakdown: oldPublishedDataFirestore.scoreBreakdown ? { serviceRules: oldPublishedDataFirestore.scoreBreakdown.serviceRules, employeeWellbeing: oldPublishedDataFirestore.scoreBreakdown.employeeWellbeing } : undefined,
    createdAt: oldPublishedDataFirestore.createdAt instanceof Timestamp ? oldPublishedDataFirestore.createdAt.toMillis() : (oldPublishedDataFirestore.createdAt || 0),
    updatedAt: oldPublishedDataFirestore.updatedAt instanceof Timestamp ? oldPublishedDataFirestore.updatedAt.toMillis() : (oldPublishedDataFirestore.updatedAt || 0),
  };

  // Archive the current published version
  batch.update(publishedDocRef, { status: 'archived', updatedAt: serverTimestamp() });

  const newVersion = (oldPublishedData.version || 0) + 1;
  const newPublishedDocRef = doc(collection(db, MONTHLY_SCHEDULES_COLLECTION)); // Auto-generate ID

  // Prepare the data for the new published version
  // It takes all fields from the old published version, applies the updates from scheduleData,
  // and then sets new status, version, and timestamps.
  const dataForNewPublishedVersion = {
    ...oldPublishedData, // Start with all data from the old published version
    ...scheduleData,     // Apply the partial updates
    id: newPublishedDocRef.id, // This is for the client-side return, not stored in DB as 'id' field
    status: 'published' as const,
    version: newVersion,
    // Preserve original `createdAt` of the schedule lineage, if that's the intent
    // or use `oldPublishedData.createdAt` if you mean createdAt of the *previous published version*
    // For a new version, `createdAt` should ideally be `serverTimestamp()`
    createdAt: serverTimestamp(), 
    updatedAt: serverTimestamp(),
  };
  
  // Remove 'id' from the payload to be stored in Firestore, as ID is the document's name
  const { id, ...payloadWithoutId } = dataForNewPublishedVersion;

  batch.set(newPublishedDocRef, cleanDataForFirestore(payloadWithoutId));

  try {
    await batch.commit();
    const nowMillis = Date.now(); // Approximate client time
    return {
      ...payloadWithoutId, // This already contains the merged old and new data
      id: newPublishedDocRef.id, // Add the new document ID
      createdAt: nowMillis, // Reflect that this is a new document's creation time (approx)
      updatedAt: nowMillis, 
    } as MonthlySchedule;
  } catch (error) {
    console.error("Error updating published schedule directly:", error);
    throw new Error(`Failed to update published schedule ${scheduleId}: ${(error as Error).message}`);
  }
};

/**
 * Cambia el estado de un horario existente a 'archived'.
 * Esto se puede usar para archivar borradores o horarios publicados que ya no son relevantes.
 *
 * @async
 * @param {string} scheduleId - El ID del horario a archivar.
 * @returns {Promise<void>} Una promesa que se resuelve cuando el horario se ha archivado.
 * @throws {Error} Si falla la actualización.
 */
export const archiveSchedule = async (scheduleId: string): Promise<void> => {
  const scheduleDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, scheduleId);
  try {
    await updateDoc(scheduleDocRef, {
      status: 'archived',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error archiving schedule with ID:", scheduleId, "Actual error:", error);
    throw new Error(`Failed to archive schedule ${scheduleId}: ${(error as Error).message}`);
  }
};

