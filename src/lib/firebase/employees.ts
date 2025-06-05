
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './config';
import type { Employee, EmployeePreferences, FixedAssignment } from '@/lib/types';
import { cleanDataForFirestore } from '@/lib/utils';

const EMPLOYEES_COLLECTION = 'employees';

const defaultPreferences: EmployeePreferences = {
  eligibleForDayOffAfterDuty: false,
  prefersWeekendWork: false,
  fixedWeeklyShiftDays: [],
  fixedWeeklyShiftTiming: null,
};

// Helper to convert Firestore doc to Employee type
const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Employee => {
  const data = snapshot.data();
  
  const preferencesData = data.preferences || {};
  const finalPreferences: EmployeePreferences = {
    eligibleForDayOffAfterDuty: preferencesData.eligibleForDayOffAfterDuty === undefined ? defaultPreferences.eligibleForDayOffAfterDuty : preferencesData.eligibleForDayOffAfterDuty,
    prefersWeekendWork: preferencesData.prefersWeekendWork === undefined ? defaultPreferences.prefersWeekendWork : preferencesData.prefersWeekendWork,
    fixedWeeklyShiftDays: preferencesData.fixedWeeklyShiftDays || defaultPreferences.fixedWeeklyShiftDays,
    fixedWeeklyShiftTiming: preferencesData.fixedWeeklyShiftTiming === undefined ? defaultPreferences.fixedWeeklyShiftTiming : preferencesData.fixedWeeklyShiftTiming,
  };

  const fixedAssignmentsData = data.fixedAssignments || [];
  const finalFixedAssignments: FixedAssignment[] = fixedAssignmentsData.map((assign: any) => ({
    type: assign.type,
    startDate: assign.startDate, // Assume dates are stored as YYYY-MM-DD strings
    endDate: assign.endDate,
    description: assign.description || '',
  }));
  
  return {
    id: snapshot.id,
    name: data.name,
    contact: data.contact,
    serviceIds: data.serviceIds || [],
    roles: data.roles || [],
    preferences: finalPreferences,
    availability: data.availability || '',
    constraints: data.constraints || '',
    fixedAssignments: finalFixedAssignments,
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
  
  let preferencesToSave: EmployeePreferences | undefined = undefined;
  if (employeeData.preferences) {
    preferencesToSave = {
      eligibleForDayOffAfterDuty: employeeData.preferences.eligibleForDayOffAfterDuty ?? defaultPreferences.eligibleForDayOffAfterDuty,
      prefersWeekendWork: employeeData.preferences.prefersWeekendWork ?? defaultPreferences.prefersWeekendWork,
      fixedWeeklyShiftDays: employeeData.preferences.fixedWeeklyShiftDays || defaultPreferences.fixedWeeklyShiftDays,
      fixedWeeklyShiftTiming: employeeData.preferences.fixedWeeklyShiftTiming === undefined ? defaultPreferences.fixedWeeklyShiftTiming : employeeData.preferences.fixedWeeklyShiftTiming,
    };
  } else {
    preferencesToSave = { ...defaultPreferences };
  }

  const dataToSave = {
    ...employeeData,
    preferences: preferencesToSave,
    fixedAssignments: employeeData.fixedAssignments || [], // Ensure it's an array
  };

  const cleanedData = cleanDataForFirestore(dataToSave);
  const docRef = await addDoc(employeesCol, cleanedData);

  const savedEmployeeData = cleanedData as Omit<Employee, 'id'>;
  if (savedEmployeeData.preferences === undefined) {
    savedEmployeeData.preferences = { ...defaultPreferences };
  }
  if (savedEmployeeData.fixedAssignments === undefined) {
    savedEmployeeData.fixedAssignments = [];
  }

  return { id: docRef.id, ...savedEmployeeData };
};

export const updateEmployee = async (employeeId: string, employeeData: Partial<Omit<Employee, 'id'>>): Promise<void> => {
  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);
  
  let dataToUpdate = { ...employeeData };

  if (employeeData.hasOwnProperty('preferences')) {
    if (employeeData.preferences) {
      dataToUpdate.preferences = {
        eligibleForDayOffAfterDuty: employeeData.preferences.eligibleForDayOffAfterDuty ?? defaultPreferences.eligibleForDayOffAfterDuty,
        prefersWeekendWork: employeeData.preferences.prefersWeekendWork ?? defaultPreferences.prefersWeekendWork,
        fixedWeeklyShiftDays: employeeData.preferences.fixedWeeklyShiftDays || defaultPreferences.fixedWeeklyShiftDays,
        fixedWeeklyShiftTiming: employeeData.preferences.fixedWeeklyShiftTiming === undefined ? defaultPreferences.fixedWeeklyShiftTiming : employeeData.preferences.fixedWeeklyShiftTiming,
      };
    } else {
      dataToUpdate.preferences = { ...defaultPreferences };
    }
  }

  if (employeeData.hasOwnProperty('fixedAssignments')) {
    dataToUpdate.fixedAssignments = employeeData.fixedAssignments || [];
  }
  
  await updateDoc(employeeDoc, cleanDataForFirestore(dataToUpdate));
};

export const deleteEmployee = async (employeeId: string): Promise<void> => {
  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);
  await deleteDoc(employeeDoc);
};
