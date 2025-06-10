
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
} from 'firebase/firestore';
import { db } from './config';
import type { MonthlySchedule, AIShift, ScheduleViolation, ScoreBreakdown } from '@/lib/types';
import { cleanDataForFirestore } from '@/lib/utils';
import { format, addMonths } from 'date-fns';


const MONTHLY_SCHEDULES_COLLECTION = 'monthlySchedules';

export const generateScheduleKey = (year: string, month: string, serviceId: string): string => {
  return `${year}-${String(month).padStart(2, '0')}-${serviceId}`;
};

const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): MonthlySchedule => {
    const data = snapshot.data();
    return {
        id: snapshot.id,
        scheduleKey: data.scheduleKey,
        year: data.year,
        month: data.month,
        serviceId: data.serviceId,
        serviceName: data.serviceName,
        shifts: data.shifts || [],
        status: data.status || 'archived', // Default to archived if status is missing or invalid
        version: data.version || 0,
        responseText: data.responseText,
        score: data.score,
        violations: data.violations || [],
        scoreBreakdown: data.scoreBreakdown ? { serviceRules: data.scoreBreakdown.serviceRules, employeeWellbeing: data.scoreBreakdown.employeeWellbeing } : undefined,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (typeof data.createdAt === 'number' ? data.createdAt : 0),
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : (typeof data.updatedAt === 'number' ? data.updatedAt : 0),
    } as MonthlySchedule;
};

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
    orderBy('version', 'desc'), // Get the latest published version if multiple (shouldn't happen with correct logic)
    limit(1)
  );

  try {
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }
    return fromFirestore(snapshot.docs[0]);
  } catch (error) {
    console.error("Error fetching published monthly schedule:", { scheduleKey, error });
    throw new Error(`Error fetching published schedule for ${scheduleKey}: ${(error as Error).message}`);
  }
};

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
    orderBy('updatedAt', 'desc'), // Get the most recently updated draft
    limit(1)
  );

  try {
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }
    return fromFirestore(snapshot.docs[0]);
  } catch (error) {
    console.error("Error fetching draft monthly schedule:", { scheduleKey, error });
    throw new Error(`Error fetching draft schedule for ${scheduleKey}: ${(error as Error).message}`);
  }
};


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
    const currentMonthStr = format(currentDate, 'M'); // 'M' for month without leading zero

    let q;
    if (serviceId && serviceId !== "__ALL_SERVICES_COMPARISON__") {
      const scheduleKey = generateScheduleKey(currentYearStr, currentMonthStr, serviceId);
      q = query(
        schedulesCol,
        where('scheduleKey', '==', scheduleKey),
        where('status', '==', 'published'), // Reports should generally use published schedules
        orderBy('version', 'desc'),
        limit(1)
      );
    } else {
      q = query(
        schedulesCol,
        where('year', '==', currentYearStr),
        where('month', '==', currentMonthStr),
        where('status', '==', 'published') // Reports should generally use published schedules
      );
    }

    try {
      const snapshot = await getDocs(q);
      snapshot.forEach(doc => {
        // If not filtering by serviceId, there might be multiple services, add them all.
        // If filtering by serviceId, limit(1) already handles it.
        allSchedules.push(fromFirestore(doc));
      });
    } catch (error) {
      console.error("Error fetching schedules in date range for", { currentYearStr, currentMonthStr, serviceId, error });
    }
    currentDate = addMonths(currentDate, 1);
  }
  return allSchedules;
};


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
      status: 'draft' as const, // Explicitly set status to draft
      updatedAt: serverTimestamp(),
  };
  
  let draftIdToReturn = existingDraftIdToUpdate;
  let versionToReturn = scheduleData.version || 1; 
  let createdAtToReturn = scheduleData.createdAt || Date.now();


  try {
    if (existingDraftIdToUpdate) {
      const draftDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, existingDraftIdToUpdate);
      const updatePayload = { ...dataToSave, version: versionToReturn }; 
      await updateDoc(draftDocRef, cleanDataForFirestore(updatePayload));
    } else {
      // Check if a draft already exists for this key, if no ID was provided for update
      const q = query(schedulesCol, where('scheduleKey', '==', scheduleKey), where('status', '==', 'draft'), limit(1));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) { // A draft exists, update it
        const existingDoc = snapshot.docs[0];
        draftIdToReturn = existingDoc.id;
        versionToReturn = existingDoc.data().version || 1; // Use existing draft's version
        createdAtToReturn = existingDoc.data().createdAt instanceof Timestamp ? existingDoc.data().createdAt.toMillis() : (existingDoc.data().createdAt || Date.now());
        await updateDoc(existingDoc.ref, cleanDataForFirestore({ ...dataToSave, version: versionToReturn }));
      } else { // No draft exists, create a new one
        const newDocRef = await addDoc(schedulesCol, cleanDataForFirestore({ ...dataToSave, version: 1, createdAt: serverTimestamp() }));
        draftIdToReturn = newDocRef.id;
        versionToReturn = 1;
        createdAtToReturn = Date.now(); // Approximate for return object
      }
    }

    return {
      id: draftIdToReturn!, 
      ...scheduleData,
      status: 'draft',
      version: versionToReturn,
      createdAt: createdAtToReturn,
      updatedAt: Date.now(), // Approximate for return object
    };

  } catch (error) {
      console.error("Error saving or updating draft schedule:", error);
      throw new Error(`Failed to save/update draft schedule: ${(error as Error).message}`);
  }
};


export const publishSchedule = async (
  scheduleDataToPublish: Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'status'>,
  draftIdBeingPublished?: string // ID of the draft being published, if applicable
): Promise<MonthlySchedule> => {
  const batch = writeBatch(db);
  const schedulesCol = collection(db, MONTHLY_SCHEDULES_COLLECTION);
  const scheduleKey = generateScheduleKey(scheduleDataToPublish.year, scheduleDataToPublish.month, scheduleDataToPublish.serviceId);

  let newVersion = 1;

  // 1. Archive any existing 'published' schedule for this key
  const publishedQuery = query(
    schedulesCol,
    where('scheduleKey', '==', scheduleKey),
    where('status', '==', 'published'),
    limit(1)
  );
  const publishedSnapshot = await getDocs(publishedQuery);
  if (!publishedSnapshot.empty) {
    const oldPublishedDoc = publishedSnapshot.docs[0];
    newVersion = (oldPublishedDoc.data().version || 0) + 1;
    batch.update(oldPublishedDoc.ref, { status: 'archived', updatedAt: serverTimestamp() });
  } else {
    // If no previous published, check for highest version among archived to continue sequence, or start at 1
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
  }
  
  // 2. If a specific draft is being published, archive it.
  // (If not, and another draft exists for this key, it will be implicitly archived if the user chose to overwrite,
  // or this publish action might be blocked by UI if a different draft exists and user didn't choose to overwrite)
  if (draftIdBeingPublished) {
    const draftDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, draftIdBeingPublished);
    // We assume this draft exists and needs to be archived. Check existence if necessary.
    batch.update(draftDocRef, { status: 'archived', updatedAt: serverTimestamp() });
  } else {
    // If no specific draft ID is given, we might still want to archive any *other* draft for this key
    // to ensure only one "active work" (the one being published) exists.
    // However, this could be risky if the UI doesn't manage this flow well.
    // For now, only archive the explicitly provided draftId.
  }


  // 3. Create the new 'published' schedule
  const newPublishedDocRef = doc(collection(db, MONTHLY_SCHEDULES_COLLECTION));
  const newScheduleForDb = {
    ...scheduleDataToPublish,
    scheduleKey,
    scoreBreakdown: scheduleDataToPublish.scoreBreakdown ? { serviceRules: scheduleDataToPublish.scoreBreakdown.serviceRules, employeeWellbeing: scheduleDataToPublish.scoreBreakdown.employeeWellbeing } : undefined,
    status: 'published' as const,
    version: newVersion,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  batch.set(newPublishedDocRef, cleanDataForFirestore(newScheduleForDb));

  try {
    await batch.commit();
    const nowMillis = Date.now();
    return {
      id: newPublishedDocRef.id,
      ...scheduleDataToPublish,
      status: 'published',
      version: newVersion,
      createdAt: nowMillis, // Approximate
      updatedAt: nowMillis, // Approximate
    };
  } catch (error) {
    console.error("Error publishing schedule:", error);
    throw new Error(`Failed to publish schedule: ${(error as Error).message}`);
  }
};


export const updatePublishedScheduleDirectly = async ( // Renamed for clarity
  scheduleId: string, // ID of the published schedule to update
  scheduleData: Partial<Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'scheduleKey' | 'year' | 'month' | 'serviceId' | 'serviceName'>>
): Promise<MonthlySchedule> => {
  const batch = writeBatch(db);
  const schedulesCol = collection(db, MONTHLY_SCHEDULES_COLLECTION);
  const publishedDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, scheduleId);

  const publishedDocSnap = await getDocs(query(schedulesCol, where('__name__', '==', scheduleId), limit(1)));
  
  if (publishedDocSnap.empty || publishedDocSnap.docs[0].data().status !== 'published') {
      throw new Error(`Schedule with ID ${scheduleId} not found or is not published.`);
  }
  const oldPublishedData = fromFirestore(publishedDocSnap.docs[0]);

  // 1. Archive the current published version
  batch.update(publishedDocRef, { status: 'archived', updatedAt: serverTimestamp() });

  // 2. Create a new published version with updated data and incremented version
  const newVersion = (oldPublishedData.version || 0) + 1;
  const newPublishedDocRef = doc(collection(db, MONTHLY_SCHEDULES_COLLECTION));

  const dataForNewPublishedVersion = {
    ...oldPublishedData, // Start with old data to preserve fields not being updated
    ...scheduleData,     // Override with new data
    id: newPublishedDocRef.id, // Ensure new ID is used for the new document
    status: 'published' as const,
    version: newVersion,
    scoreBreakdown: scheduleData.scoreBreakdown ? { serviceRules: scheduleData.scoreBreakdown.serviceRules, employeeWellbeing: scheduleData.scoreBreakdown.employeeWellbeing } : (oldPublishedData.scoreBreakdown ? { serviceRules: oldPublishedData.scoreBreakdown.serviceRules, employeeWellbeing: oldPublishedData.scoreBreakdown.employeeWellbeing } : undefined),
    createdAt: oldPublishedData.createdAt, // Preserve original creation timestamp
    updatedAt: serverTimestamp(),
  };
  
  // Remove the original id from the payload before setting the new document
  const { id, ...payloadWithoutId } = dataForNewPublishedVersion;

  batch.set(newPublishedDocRef, cleanDataForFirestore(payloadWithoutId));

  try {
    await batch.commit();
    const nowMillis = Date.now();
    return {
      ...payloadWithoutId,
      id: newPublishedDocRef.id,
      createdAt: oldPublishedData.createdAt,
      updatedAt: nowMillis, // Approximate
    } as MonthlySchedule;
  } catch (error) {
    console.error("Error updating published schedule directly:", error);
    throw new Error(`Failed to update published schedule ${scheduleId}: ${(error as Error).message}`);
  }
};


export const archiveSchedule = async (scheduleId: string): Promise<void> => {
  const scheduleDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, scheduleId);
  try {
    await updateDoc(scheduleDocRef, {
      status: 'archived',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error archiving schedule:", { scheduleId, error });
    throw new Error(`Failed to archive schedule ${scheduleId}: ${(error as Error).message}`);
  }
};
