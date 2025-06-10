
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
    if (snapshot.empty) {
      return null;
    }
    return fromFirestore(snapshot.docs[0]);
  } catch (error) {
    console.error("Error fetching published monthly schedule for key:", scheduleKey, "Actual error:", error);
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
  let createdAtToReturn = Date.now();


  try {
    if (existingDraftIdToUpdate) {
      const draftDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, existingDraftIdToUpdate);
      const existingDocSnap = await getDoc(draftDocRef);
      if (existingDocSnap.exists()) {
          versionToReturn = existingDocSnap.data().version || 1; // Keep existing draft's version
          createdAtToReturn = existingDocSnap.data().createdAt instanceof Timestamp ? existingDocSnap.data().createdAt.toMillis() : (existingDocSnap.data().createdAt || Date.now());
      }
      const updatePayload = { ...dataToSave, version: versionToReturn, createdAt: existingDocSnap.exists() ? existingDocSnap.data().createdAt : serverTimestamp() }; 
      await updateDoc(draftDocRef, cleanDataForFirestore(updatePayload));
    } else {
      const q = query(schedulesCol, where('scheduleKey', '==', scheduleKey), where('status', '==', 'draft'), limit(1));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) { 
        const existingDoc = snapshot.docs[0];
        draftIdToReturn = existingDoc.id;
        versionToReturn = existingDoc.data().version || 1; 
        createdAtToReturn = existingDoc.data().createdAt instanceof Timestamp ? existingDoc.data().createdAt.toMillis() : (existingDoc.data().createdAt || Date.now());
        await updateDoc(existingDoc.ref, cleanDataForFirestore({ ...dataToSave, version: versionToReturn, createdAt: existingDoc.data().createdAt }));
      } else { 
        const newDocRef = await addDoc(schedulesCol, cleanDataForFirestore({ ...dataToSave, version: 1, createdAt: serverTimestamp() }));
        draftIdToReturn = newDocRef.id;
        versionToReturn = 1;
        createdAtToReturn = Date.now(); 
      }
    }

    return {
      id: draftIdToReturn!, 
      ...scheduleData,
      status: 'draft',
      version: versionToReturn,
      createdAt: createdAtToReturn,
      updatedAt: Date.now(), 
    };

  } catch (error) {
      console.error("Error saving or updating draft schedule:", error);
      throw new Error(`Failed to save/update draft schedule: ${(error as Error).message}`);
  }
};


export const publishSchedule = async (
  scheduleDataToPublish: Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'status'>,
  draftIdBeingPublished?: string 
): Promise<MonthlySchedule> => {
  const batch = writeBatch(db);
  const schedulesCol = collection(db, MONTHLY_SCHEDULES_COLLECTION);
  const scheduleKey = generateScheduleKey(scheduleDataToPublish.year, scheduleDataToPublish.month, scheduleDataToPublish.serviceId);

  let newVersion = 1;

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
  
  if (draftIdBeingPublished) {
    const draftDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, draftIdBeingPublished);
    // Check if draft exists before trying to update it
    const draftSnap = await getDoc(draftDocRef);
    if (draftSnap.exists()) {
        batch.update(draftDocRef, { status: 'archived', updatedAt: serverTimestamp() });
    } else {
        console.warn(`Draft with ID ${draftIdBeingPublished} not found while trying to archive it during publish.`);
    }
  }

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
      createdAt: nowMillis, 
      updatedAt: nowMillis, 
    };
  } catch (error) {
    console.error("Error publishing schedule:", error);
    throw new Error(`Failed to publish schedule: ${(error as Error).message}`);
  }
};


export const updatePublishedScheduleDirectly = async ( 
  scheduleId: string, 
  scheduleData: Partial<Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'scheduleKey' | 'year' | 'month' | 'serviceId' | 'serviceName'>>
): Promise<MonthlySchedule> => {
  const batch = writeBatch(db);
  const schedulesCol = collection(db, MONTHLY_SCHEDULES_COLLECTION);
  const publishedDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, scheduleId);

  const publishedDocSnap = await getDoc(publishedDocRef); // Use getDoc instead of query for a single doc by ID
  
  if (!publishedDocSnap.exists() || publishedDocSnap.data().status !== 'published') {
      throw new Error(`Schedule with ID ${scheduleId} not found or is not published.`);
  }
  const oldPublishedDataFirestore = publishedDocSnap.data();
   const oldPublishedData: MonthlySchedule = {
    id: publishedDocSnap.id,
    scheduleKey: oldPublishedDataFirestore.scheduleKey,
    year: oldPublishedDataFirestore.year,
    month: oldPublishedDataFirestore.month,
    serviceId: oldPublishedDataFirestore.serviceId,
    serviceName: oldPublishedDataFirestore.serviceName,
    shifts: oldPublishedDataFirestore.shifts || [],
    status: oldPublishedDataFirestore.status,
    version: oldPublishedDataFirestore.version || 0,
    responseText: oldPublishedDataFirestore.responseText,
    score: oldPublishedDataFirestore.score,
    violations: oldPublishedDataFirestore.violations || [],
    scoreBreakdown: oldPublishedDataFirestore.scoreBreakdown ? { serviceRules: oldPublishedDataFirestore.scoreBreakdown.serviceRules, employeeWellbeing: oldPublishedDataFirestore.scoreBreakdown.employeeWellbeing } : undefined,
    createdAt: oldPublishedDataFirestore.createdAt instanceof Timestamp ? oldPublishedDataFirestore.createdAt.toMillis() : (oldPublishedDataFirestore.createdAt || 0),
    updatedAt: oldPublishedDataFirestore.updatedAt instanceof Timestamp ? oldPublishedDataFirestore.updatedAt.toMillis() : (oldPublishedDataFirestore.updatedAt || 0),
  };


  batch.update(publishedDocRef, { status: 'archived', updatedAt: serverTimestamp() });

  const newVersion = (oldPublishedData.version || 0) + 1;
  const newPublishedDocRef = doc(collection(db, MONTHLY_SCHEDULES_COLLECTION));

  const dataForNewPublishedVersion = {
    ...oldPublishedData, 
    ...scheduleData,     
    id: newPublishedDocRef.id, 
    status: 'published' as const,
    version: newVersion,
    scoreBreakdown: scheduleData.scoreBreakdown ? { serviceRules: scheduleData.scoreBreakdown.serviceRules, employeeWellbeing: scheduleData.scoreBreakdown.employeeWellbeing } : (oldPublishedData.scoreBreakdown ? { serviceRules: oldPublishedData.scoreBreakdown.serviceRules, employeeWellbeing: oldPublishedData.scoreBreakdown.employeeWellbeing } : undefined),
    createdAt: oldPublishedData.createdAt, 
    updatedAt: serverTimestamp(),
  };
  
  const { id, ...payloadWithoutId } = dataForNewPublishedVersion;

  batch.set(newPublishedDocRef, cleanDataForFirestore(payloadWithoutId));

  try {
    await batch.commit();
    const nowMillis = Date.now();
    return {
      ...payloadWithoutId,
      id: newPublishedDocRef.id,
      createdAt: oldPublishedData.createdAt,
      updatedAt: nowMillis, 
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
    console.error("Error archiving schedule with ID:", scheduleId, "Actual error:", error);
    throw new Error(`Failed to archive schedule ${scheduleId}: ${(error as Error).message}`);
  }
};

