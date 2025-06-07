
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
  minConsecutiveDaysOffRequiredBeforeWork: 1, // Mínimo 1 día de descanso por defecto
};

// Helper to convert Firestore doc to Service type
const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Service => {
  const data = snapshot.data();
  const rulesFromServer = data.consecutivenessRules || {};
  return {
    id: snapshot.id,
    name: data.name,
    description: data.description,
    enableNightShift: data.enableNightShift || false,
    staffingNeeds: { ...defaultStaffingNeeds, ...data.staffingNeeds },
    consecutivenessRules: { ...defaultConsecutivenessRules, ...rulesFromServer },
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
  const dataWithDefaults = {
    ...serviceData,
    staffingNeeds: { ...defaultStaffingNeeds, ...serviceData.staffingNeeds },
    consecutivenessRules: { ...defaultConsecutivenessRules, ...serviceData.consecutivenessRules },
  };
  const cleanedData = cleanDataForFirestore(dataWithDefaults);
  const docRef = await addDoc(servicesCol, cleanedData);
  return { id: docRef.id, ...(cleanedData as Omit<Service, 'id'>) };
};

export const updateService = async (serviceId: string, serviceData: Partial<Omit<Service, 'id'>>): Promise<void> => {
  const serviceDoc = doc(db, SERVICES_COLLECTION, serviceId);
  // Ensure defaults are not accidentally wiped if partial data is sent for nested objects
  const updateData = { ...serviceData };
  if (serviceData.staffingNeeds) {
    updateData.staffingNeeds = { ...defaultStaffingNeeds, ...serviceData.staffingNeeds };
  }
  if (serviceData.consecutivenessRules) {
    updateData.consecutivenessRules = { ...defaultConsecutivenessRules, ...serviceData.consecutivenessRules };
  }
  await updateDoc(serviceDoc, cleanDataForFirestore(updateData));
};

export const deleteService = async (serviceId: string): Promise<void> => {
  const serviceDoc = doc(db, SERVICES_COLLECTION, serviceId);
  await deleteDoc(serviceDoc);
};
