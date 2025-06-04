
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './config';
import type { Shift } from '@/lib/types';
import { cleanDataForFirestore } from '@/lib/utils';

const SHIFTS_COLLECTION = 'shifts';

// Helper to convert Firestore doc to Shift type
const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Shift => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    employeeId: data.employeeId,
    serviceId: data.serviceId,
    date: data.date, // Ensure date is stored and retrieved correctly (e.g., as ISO string)
    startTime: data.startTime,
    endTime: data.endTime,
    notes: data.notes,
  } as Shift;
};

export const getShifts = async (): Promise<Shift[]> => {
  const shiftsCol = collection(db, SHIFTS_COLLECTION);
  // Consider ordering by date and then startTime
  const q = query(shiftsCol, orderBy('date'), orderBy('startTime'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(fromFirestore);
};

export const addShift = async (shiftData: Omit<Shift, 'id'>): Promise<Shift> => {
  const shiftsCol = collection(db, SHIFTS_COLLECTION);
  const cleanedData = cleanDataForFirestore(shiftData);
  const docRef = await addDoc(shiftsCol, cleanedData);
  return { id: docRef.id, ...(cleanedData as Omit<Shift, 'id'>) };
};

export const updateShift = async (shiftId: string, shiftData: Partial<Omit<Shift, 'id'>>): Promise<void> => {
  const shiftDoc = doc(db, SHIFTS_COLLECTION, shiftId);
  await updateDoc(shiftDoc, cleanDataForFirestore(shiftData));
};

export const deleteShift = async (shiftId: string): Promise<void> => {
  const shiftDoc = doc(db, SHIFTS_COLLECTION, shiftId);
  await deleteDoc(shiftDoc);
};
