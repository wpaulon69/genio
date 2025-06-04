
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './config';
import type { Service, StaffingNeeds, ConsecutivenessRules } from '@/lib/types';
import { cleanDataForFirestore } from '@/lib/utils';

const SERVICES_COLLECTION = 'services';

const defaultStaffingNeeds: StaffingNeeds = {
  morningWeekday: 0,
  afternoonWeekday: 0,
  nightWeekday: 0,
  morningWeekendHoliday: 0,
  afternoonWeekendHoliday: 0,
  nightWeekendHoliday: 0,
};

const defaultConsecutivenessRules: ConsecutivenessRules = {
  maxConsecutiveWorkDays: 6,
  preferredConsecutiveWorkDays: 5,
  maxConsecutiveDaysOff: 3,
  preferredConsecutiveDaysOff: 2,
};

// Helper to convert Firestore doc to Service type
const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Service => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: data.name,
    description: data.description,
    enableNightShift: data.enableNightShift || false,
    staffingNeeds: { ...defaultStaffingNeeds, ...data.staffingNeeds },
    consecutivenessRules: { ...defaultConsecutivenessRules, ...data.consecutivenessRules },
    additionalNotes: data.additionalNotes || '',
  } as Service;
};

export const getServices = async (): Promise<Service[]> => {
  const servicesCol = collection(db, SERVICES_COLLECTION);
  const q = query(servicesCol, orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(fromFirestore);
};

export const addService = async (serviceData: Omit<Service, 'id'>): Promise<Service> => {
  const servicesCol = collection(db, SERVICES_COLLECTION);
  const cleanedData = cleanDataForFirestore(serviceData);
  const docRef = await addDoc(servicesCol, cleanedData);
  return { id: docRef.id, ...(cleanedData as Omit<Service, 'id'>) };
};

export const updateService = async (serviceId: string, serviceData: Partial<Omit<Service, 'id'>>): Promise<void> => {
  const serviceDoc = doc(db, SERVICES_COLLECTION, serviceId);
  await updateDoc(serviceDoc, cleanDataForFirestore(serviceData));
};

export const deleteService = async (serviceId: string): Promise<void> => {
  const serviceDoc = doc(db, SERVICES_COLLECTION, serviceId);
  await deleteDoc(serviceDoc);
};
