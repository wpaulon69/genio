
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './config';
import type { Holiday } from '@/lib/types';
import { cleanDataForFirestore } from '@/lib/utils';

const HOLIDAYS_COLLECTION = 'holidays';

// Helper to convert Firestore doc to Holiday type
const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Holiday => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    date: data.date, // Stored as YYYY-MM-DD string
    name: data.name,
  } as Holiday;
};

export const getHolidays = async (): Promise<Holiday[]> => {
  const holidaysCol = collection(db, HOLIDAYS_COLLECTION);
  const q = query(holidaysCol, orderBy('date')); // Order by date
  const snapshot = await getDocs(q);
  return snapshot.docs.map(fromFirestore);
};

export const addHoliday = async (holidayData: Omit<Holiday, 'id'>): Promise<Holiday> => {
  const holidaysCol = collection(db, HOLIDAYS_COLLECTION);
  // Ensure date is in YYYY-MM-DD string format before saving, if it's a Date object
  const dataToSave = {
    ...holidayData,
    date: typeof holidayData.date === 'string' ? holidayData.date : holidayData.date, // Assuming it's already string
  };
  const cleanedData = cleanDataForFirestore(dataToSave);
  const docRef = await addDoc(holidaysCol, cleanedData);
  return { id: docRef.id, ...(cleanedData as Omit<Holiday, 'id'>) };
};

export const updateHoliday = async (holidayId: string, holidayData: Partial<Omit<Holiday, 'id'>>): Promise<void> => {
  const holidayDoc = doc(db, HOLIDAYS_COLLECTION, holidayId);
  const dataToUpdate = { ...holidayData };
  if (dataToUpdate.date && typeof dataToUpdate.date !== 'string') {
    // This case should ideally not happen if form handles conversion, but as a safeguard
    console.warn("Holiday date was not a string during update, this might be an issue.");
  }
  await updateDoc(holidayDoc, cleanDataForFirestore(dataToUpdate));
};

export const deleteHoliday = async (holidayId: string): Promise<void> => {
  const holidayDoc = doc(db, HOLIDAYS_COLLECTION, holidayId);
  await deleteDoc(holidayDoc);
};
