
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './config';
import type { Employee, EmployeePreferences } from '@/lib/types';
import { cleanDataForFirestore } from '@/lib/utils';

const EMPLOYEES_COLLECTION = 'employees';

const defaultPreferences: EmployeePreferences = {
  eligibleForDayOffAfterDuty: false,
  prefersWeekendWork: false,
  fixedWeeklyShiftDays: [],
  fixedWeeklyShiftTiming: undefined,
};

// Helper to convert Firestore doc to Employee type
const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Employee => {
  const data = snapshot.data();
  
  // Ensure preferences exists and has defaults
  const preferencesData = data.preferences || {};
  const finalPreferences: EmployeePreferences = {
    eligibleForDayOffAfterDuty: preferencesData.eligibleForDayOffAfterDuty === undefined ? defaultPreferences.eligibleForDayOffAfterDuty : preferencesData.eligibleForDayOffAfterDuty,
    prefersWeekendWork: preferencesData.prefersWeekendWork === undefined ? defaultPreferences.prefersWeekendWork : preferencesData.prefersWeekendWork,
    fixedWeeklyShiftDays: preferencesData.fixedWeeklyShiftDays || defaultPreferences.fixedWeeklyShiftDays,
    fixedWeeklyShiftTiming: preferencesData.fixedWeeklyShiftTiming || defaultPreferences.fixedWeeklyShiftTiming,
  };
  
  return {
    id: snapshot.id,
    name: data.name,
    contact: data.contact,
    serviceIds: data.serviceIds || [],
    roles: data.roles || [],
    preferences: finalPreferences,
    availability: data.availability || '',
    constraints: data.constraints || '',
  } as Employee;
};

export const getEmployees = async (): Promise<Employee[]> => {
  const employeesCol = collection(db, EMPLOYEES_COLLECTION);
  const q = query(employeesCol, orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(fromFirestore);
};

export const addEmployee = async (employeeData: Omit<Employee, 'id'>): Promise<Employee> => {
  const employeesCol = collection(db, EMPLOYEES_COLLECTION);
  // Ensure preferences object is structured correctly before cleaning
  const dataToSave = {
    ...employeeData,
    preferences: {
      ...defaultPreferences, // Start with defaults
      ...(employeeData.preferences || {}), // Override with provided preferences
    },
  };
  const cleanedData = cleanDataForFirestore(dataToSave);
  const docRef = await addDoc(employeesCol, cleanedData);
  return { id: docRef.id, ...(cleanedData as Omit<Employee, 'id'>) };
};

export const updateEmployee = async (employeeId: string, employeeData: Partial<Omit<Employee, 'id'>>): Promise<void> => {
  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);
  // Ensure preferences object is structured correctly if present in update
  let dataToUpdate = { ...employeeData };
  if (employeeData.preferences) {
    dataToUpdate.preferences = {
      ...defaultPreferences, // Start with defaults (though ideally existing doc would have them)
      ...(employeeData.preferences),
    };
  }
  await updateDoc(employeeDoc, cleanDataForFirestore(dataToUpdate));
};

export const deleteEmployee = async (employeeId: string): Promise<void> => {
  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);
  await deleteDoc(employeeDoc);
};
