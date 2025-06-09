
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
        status: data.status || 'inactive', // Default to inactive if status is missing
        version: data.version || 0,
        responseText: data.responseText,
        score: data.score,
        violations: data.violations || [],
        scoreBreakdown: data.scoreBreakdown ? { serviceRules: data.scoreBreakdown.serviceRules, employeeWellbeing: data.scoreBreakdown.employeeWellbeing } : undefined,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (typeof data.createdAt === 'number' ? data.createdAt : 0),
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : (typeof data.updatedAt === 'number' ? data.updatedAt : 0),
    } as MonthlySchedule;
};

export const getActiveMonthlySchedule = async (
  year: string,
  month: string,
  serviceId: string
): Promise<MonthlySchedule | null> => {
  if (!year || !month || !serviceId) {
    console.warn("getActiveMonthlySchedule called with invalid parameters", { year, month, serviceId });
    return null;
  }
  const scheduleKey = generateScheduleKey(year, month, serviceId);
  const schedulesCol = collection(db, MONTHLY_SCHEDULES_COLLECTION);
  const q = query(
    schedulesCol,
    where('scheduleKey', '==', scheduleKey),
    where('status', '==', 'active'),
    limit(1)
  );

  try {
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }
    return fromFirestore(snapshot.docs[0]);
  } catch (error) {
    console.error("Error fetching active monthly schedule:", { scheduleKey, error });
    throw new Error(`Error fetching active schedule for ${scheduleKey}: ${(error as Error).message}`);
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
    const currentMonthStr = format(currentDate, 'M');

    let q;
    if (serviceId && serviceId !== "__ALL_SERVICES_COMPARISON__") {
      const scheduleKey = generateScheduleKey(currentYearStr, currentMonthStr, serviceId);
      q = query(
        schedulesCol,
        where('scheduleKey', '==', scheduleKey),
        where('status', '==', 'active'),
        limit(1)
      );
    } else {

      q = query(
        schedulesCol,
        where('year', '==', currentYearStr),
        where('month', '==', currentMonthStr),
        where('status', '==', 'active')
      );
    }

    try {
      const snapshot = await getDocs(q);
      snapshot.forEach(doc => {
        allSchedules.push(fromFirestore(doc));
      });
    } catch (error) {
      console.error("Error fetching schedules in date range for", { currentYearStr, currentMonthStr, serviceId, error });

    }
    currentDate = addMonths(currentDate, 1);
  }
  return allSchedules;
};


export const saveNewActiveSchedule = async (
  scheduleData: Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'status'>,
  previousActiveScheduleIdToArchive?: string
): Promise<MonthlySchedule> => {
  const batch = writeBatch(db);
  const schedulesCol = collection(db, MONTHLY_SCHEDULES_COLLECTION);

  let newVersion = 1;

  const versionQuery = query(
    schedulesCol,
    where('scheduleKey', '==', scheduleData.scheduleKey),
    orderBy('version', 'desc'),
    limit(1)
  );

  try {
    const versionSnapshot = await getDocs(versionQuery);
    if (!versionSnapshot.empty) {
      newVersion = (versionSnapshot.docs[0].data().version || 0) + 1;
    }

    if (previousActiveScheduleIdToArchive) {
        const prevScheduleDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, previousActiveScheduleIdToArchive);
        batch.update(prevScheduleDocRef, { status: 'inactive', updatedAt: serverTimestamp() });
    } else {
      // Archive any other active or draft schedules for this key
      const conflictingQuery = query(
          schedulesCol,
          where('scheduleKey', '==', scheduleData.scheduleKey),
          where('status', 'in', ['active', 'draft'])
      );
      const conflictingSnapshot = await getDocs(conflictingQuery);
      conflictingSnapshot.forEach(docSnapshot => {
          batch.update(docSnapshot.ref, { status: 'inactive', updatedAt: serverTimestamp() });
      });
    }
    
    // If the schedule being saved was a draft, its original doc is now inactive. We create a new active one.
    // This logic assumes scheduleData might come from a modified draft that now needs to become active.
    // If scheduleData.id (from a draft) was passed, we should ensure that draft is marked inactive.

    const newDocRef = doc(collection(db, MONTHLY_SCHEDULES_COLLECTION));

    const newScheduleForDb = {
      ...scheduleData,
      scoreBreakdown: scheduleData.scoreBreakdown ? { serviceRules: scheduleData.scoreBreakdown.serviceRules, employeeWellbeing: scheduleData.scoreBreakdown.employeeWellbeing } : undefined,
      status: 'active',
      version: newVersion,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    batch.set(newDocRef, cleanDataForFirestore(newScheduleForDb));

    await batch.commit();

    const nowMillis = Date.now();
    const newScheduleForReturn: MonthlySchedule = {
      id: newDocRef.id,
      ...scheduleData,
      status: 'active',
      version: newVersion,
      createdAt: nowMillis,
      updatedAt: nowMillis,
    };
    return newScheduleForReturn;

  } catch (error) {
    console.error("Error in saveNewActiveSchedule:", error);
    throw new Error(`Failed to save new active schedule: ${(error as Error).message}`);
  }
};


export const saveOrUpdateDraftSchedule = async (
  scheduleData: Omit<MonthlySchedule, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'status'>,
  existingDraftId?: string
): Promise<MonthlySchedule> => {
  const schedulesCol = collection(db, MONTHLY_SCHEDULES_COLLECTION);
  const scheduleKey = generateScheduleKey(scheduleData.year, scheduleData.month, scheduleData.serviceId);

  const dataToSave = {
      ...scheduleData,
      scheduleKey,
      scoreBreakdown: scheduleData.scoreBreakdown ? { serviceRules: scheduleData.scoreBreakdown.serviceRules, employeeWellbeing: scheduleData.scoreBreakdown.employeeWellbeing } : undefined,
      status: 'draft',
      updatedAt: serverTimestamp(),
  };
  
  let draftIdToReturn = existingDraftId;
  let versionToReturn = scheduleData.version || 1; // Retain version if exists, else 1
  let createdAtToReturn = scheduleData.createdAt || Date.now();


  try {
    if (existingDraftId) {
      const draftDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, existingDraftId);
      // Ensure version is not accidentally reset if it exists on scheduleData from a loaded draft
      const updatePayload = { ...dataToSave, version: versionToReturn }; 
      await updateDoc(draftDocRef, cleanDataForFirestore(updatePayload));
    } else {
      // Check if a draft already exists for this key, just in case existingDraftId wasn't passed
      const q = query(schedulesCol, where('scheduleKey', '==', scheduleKey), where('status', '==', 'draft'), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const existingDoc = snapshot.docs[0];
        draftIdToReturn = existingDoc.id;
        versionToReturn = existingDoc.data().version || 1; // Use existing draft's version
        createdAtToReturn = existingDoc.data().createdAt instanceof Timestamp ? existingDoc.data().createdAt.toMillis() : (existingDoc.data().createdAt || Date.now());
        await updateDoc(existingDoc.ref, cleanDataForFirestore({ ...dataToSave, version: versionToReturn }));
      } else {
        const newDocRef = await addDoc(schedulesCol, cleanDataForFirestore({ ...dataToSave, version: 1, createdAt: serverTimestamp() }));
        draftIdToReturn = newDocRef.id;
        versionToReturn = 1;
        createdAtToReturn = Date.now(); // Approximate
      }
    }

    return {
      id: draftIdToReturn!, // Should be set by this point
      ...scheduleData,
      status: 'draft',
      version: versionToReturn,
      createdAt: createdAtToReturn,
      updatedAt: Date.now(), // Approximate
    };

  } catch (error) {
      console.error("Error saving or updating draft schedule:", error);
      throw new Error(`Failed to save/update draft schedule: ${(error as Error).message}`);
  }
};


export const updateExistingActiveSchedule = async (
  scheduleId: string,
  shifts: AIShift[],
  responseText?: string,
  score?: number,
  violations?: ScheduleViolation[],
  scoreBreakdown?: ScoreBreakdown
): Promise<void> => {
  const scheduleDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, scheduleId);

  const updateData: Partial<Omit<MonthlySchedule, 'id' | 'scheduleKey' | 'year' | 'month' | 'serviceId' | 'serviceName' | 'status' | 'version' | 'createdAt'>> = {
    shifts,
    updatedAt: serverTimestamp() as any,
  };

  if (responseText !== undefined) updateData.responseText = responseText;
  if (score !== undefined) updateData.score = score;
  if (violations !== undefined) updateData.violations = violations;

  if (scoreBreakdown !== undefined) {
    updateData.scoreBreakdown = {
      serviceRules: scoreBreakdown.serviceRules,
      employeeWellbeing: scoreBreakdown.employeeWellbeing
    };
  }

  try {
    await updateDoc(scheduleDocRef, cleanDataForFirestore(updateData));
  } catch (error) {
    console.error("Error updating existing active schedule:", { scheduleId, error });
    throw new Error(`Failed to update schedule ${scheduleId}: ${(error as Error).message}`);
  }
};

export const deleteActiveSchedule = async (scheduleId: string): Promise<void> => {
  const scheduleDocRef = doc(db, MONTHLY_SCHEDULES_COLLECTION, scheduleId);
  try {
    // This function now effectively "archives" by setting to inactive.
    // If it was a draft, it also becomes inactive.
    await updateDoc(scheduleDocRef, {
      status: 'inactive',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error deleting (inactivating) schedule:", { scheduleId, error });
    throw new Error(`Failed to delete (inactivate) schedule ${scheduleId}: ${(error as Error).message}`);
  }
};
