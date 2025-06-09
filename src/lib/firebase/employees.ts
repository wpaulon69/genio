
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './config';
import type { Employee, EmployeePreferences, FixedAssignment, WorkPattern } from '@/lib/types';
import { cleanDataForFirestore } from '@/lib/utils';

const EMPLOYEES_COLLECTION = 'employees';

const defaultPreferences: EmployeePreferences = {
  eligibleForDayOffAfterDuty: false,
  prefersWeekendWork: false,
  fixedWeeklyShiftDays: [],
  fixedWeeklyShiftTiming: null,
  workPattern: 'standardRotation', // Default work pattern
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
    workPattern: preferencesData.workPattern === undefined ? defaultPreferences.workPattern : preferencesData.workPattern,
  };

  const fixedAssignmentsData = data.fixedAssignments || [];
  const finalFixedAssignments: FixedAssignment[] = fixedAssignmentsData.map((assign: any) => ({
    type: assign.type, // Assume type is always present from Firestore if saved correctly
    startDate: assign.startDate, // Assume startDate is always present
    endDate: assign.endDate, // Will be undefined if not in Firestore
    description: assign.description, // Let it be undefined if not present
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
    fixedAssignments: finalFixedAssignments.length > 0 ? finalFixedAssignments : undefined,
  } as Employee;
};

// Helper function to clean individual fixed assignment for Firestore
// It returns Partial<FixedAssignment> but ensures type and startDate are present.
// This is compatible with FixedAssignment if endDate/description are optional in FixedAssignment.
const cleanFixedAssignmentForFirestore = (assignment: FixedAssignment): Partial<FixedAssignment> => {
  const cleanedAssignment: Partial<FixedAssignment> = {
    type: assignment.type,
    startDate: assignment.startDate,
  };
  if (assignment.endDate && typeof assignment.endDate === 'string' && assignment.endDate.trim() !== "") {
    cleanedAssignment.endDate = assignment.endDate;
  }
  // Only include description if it's a non-empty string, otherwise let it be undefined (and thus removed by cleanDataForFirestore)
  if (assignment.description && typeof assignment.description === 'string' && assignment.description.trim() !== "") {
    cleanedAssignment.description = assignment.description;
  }
  return cleanedAssignment;
};

export const getEmployees = async (): Promise<Employee[]> => {
  const employeesCol = collection(db, EMPLOYEES_COLLECTION);
  const q = query(employeesCol, orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(fromFirestore);
};

export const addEmployee = async (employeeData: Omit<Employee, 'id'>): Promise<Employee> => {
  const employeesCol = collection(db, EMPLOYEES_COLLECTION);

  let preferencesToSave: EmployeePreferences;
  if (employeeData.preferences) {
    preferencesToSave = {
      eligibleForDayOffAfterDuty: employeeData.preferences.eligibleForDayOffAfterDuty ?? defaultPreferences.eligibleForDayOffAfterDuty,
      prefersWeekendWork: employeeData.preferences.prefersWeekendWork ?? defaultPreferences.prefersWeekendWork,
      fixedWeeklyShiftDays: employeeData.preferences.fixedWeeklyShiftDays || defaultPreferences.fixedWeeklyShiftDays,
      fixedWeeklyShiftTiming: employeeData.preferences.fixedWeeklyShiftTiming === undefined ? defaultPreferences.fixedWeeklyShiftTiming : employeeData.preferences.fixedWeeklyShiftTiming,
      workPattern: (employeeData.preferences.workPattern === 'standardRotation' ? null : employeeData.preferences.workPattern) ?? defaultPreferences.workPattern,
    };
  } else {
    preferencesToSave = { ...defaultPreferences };
  }

  const processedFixedAssignments = (employeeData.fixedAssignments || []).map(cleanFixedAssignmentForFirestore);

  const dataToSave = {
    ...employeeData,
    preferences: preferencesToSave,
    fixedAssignments: processedFixedAssignments,
  };

  const cleanedData = cleanDataForFirestore(dataToSave);
  const docRef = await addDoc(employeesCol, cleanedData);

  // Explicitly construct the returned object to match the Employee type
  const returnedEmployee: Employee = {
    id: docRef.id,
    name: cleanedData.name as string, // employeeData ensures this is string
    contact: cleanedData.contact as string, // employeeData ensures this is string
    serviceIds: cleanedData.serviceIds as string[], // employeeData ensures this is string[]
    roles: cleanedData.roles as string[], // employeeData ensures this is string[]
    availability: cleanedData.availability as string, // employeeData ensures this is string
    constraints: cleanedData.constraints as string, // employeeData ensures this is string
    preferences: cleanedData.preferences as EmployeePreferences, // preferencesToSave ensures this is EmployeePreferences
    fixedAssignments: (cleanedData.fixedAssignments || []) as FixedAssignment[], // cleanFixedAssignmentForFirestore ensures type/startDate
  };

  // Ensure fixedAssignments is undefined if the array is empty, to match `?: FixedAssignment[]`
  if (returnedEmployee.fixedAssignments && returnedEmployee.fixedAssignments.length === 0) {
    returnedEmployee.fixedAssignments = undefined;
  }
  
  // Ensure preferences matches the optional nature if it's equivalent to default and no other part of it is set
  // However, `preferencesToSave` always creates a full EmployeePreferences object.
  // The type `Employee` has `preferences?: EmployeePreferences;` which is fine.

  return returnedEmployee;
};

export const updateEmployee = async (employeeId: string, employeeData: Partial<Omit<Employee, 'id'>>): Promise<void> => {
  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);

  let dataToUpdate: Partial<Omit<Employee, 'id'>> = { ...employeeData };

  if (employeeData.hasOwnProperty('preferences')) {
    const newPrefs = employeeData.preferences || {}; // newPrefs can be Partial<EmployeePreferences> or undefined
    // Construct a full EmployeePreferences object, ensuring all fields are present or default
    dataToUpdate.preferences = {
        eligibleForDayOffAfterDuty: newPrefs.eligibleForDayOffAfterDuty ?? defaultPreferences.eligibleForDayOffAfterDuty,
        prefersWeekendWork: newPrefs.prefersWeekendWork ?? defaultPreferences.prefersWeekendWork,
        fixedWeeklyShiftDays: newPrefs.fixedWeeklyShiftDays || defaultPreferences.fixedWeeklyShiftDays,
        fixedWeeklyShiftTiming: newPrefs.fixedWeeklyShiftTiming === undefined ? defaultPreferences.fixedWeeklyShiftTiming : newPrefs.fixedWeeklyShiftTiming,
        workPattern: (newPrefs.workPattern === 'standardRotation' ? null : newPrefs.workPattern) ?? defaultPreferences.workPattern,
    };
  }


  if (employeeData.hasOwnProperty('fixedAssignments')) {
    // Ensure that even if an empty array is passed, it's stored as such (or omitted if that's the desired behavior)
    dataToUpdate.fixedAssignments = (employeeData.fixedAssignments || []).map(cleanFixedAssignmentForFirestore);
  }

  await updateDoc(employeeDoc, cleanDataForFirestore(dataToUpdate));
};

export const deleteEmployee = async (employeeId: string): Promise<void> => {
  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);
  await deleteDoc(employeeDoc);
};

