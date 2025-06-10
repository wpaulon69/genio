
/**
 * @fileOverview Módulo para interactuar con la colección 'employees' en Firebase Firestore.
 * Proporciona funciones CRUD (Crear, Leer, Actualizar, Eliminar) para la gestión de empleados.
 * También maneja la normalización de datos y la aplicación de valores por defecto para
 * estructuras anidadas como `preferences` y `fixedAssignments`.
 */

import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './config';
import type { Employee, EmployeePreferences, FixedAssignment, WorkPattern } from '@/lib/types';
import { cleanDataForFirestore } from '@/lib/utils';

/** Nombre de la colección de empleados en Firestore. */
const EMPLOYEES_COLLECTION = 'employees';

/**
 * Valores por defecto para las preferencias de un empleado.
 * Se utilizan si no se especifican al crear o actualizar un empleado.
 */
const defaultPreferences: EmployeePreferences = {
  eligibleForDayOffAfterDuty: false,
  prefersWeekendWork: false,
  fixedWeeklyShiftDays: [],
  fixedWeeklyShiftTiming: null,
  workPattern: 'standardRotation', // Default work pattern
};

/**
 * Convierte un documento de Firestore (`QueryDocumentSnapshot`) a un objeto de tipo `Employee`.
 * Asegura que las propiedades anidadas como `preferences` y `fixedAssignments`
 * tengan valores por defecto si no están presentes o están incompletas en Firestore.
 *
 * @param {QueryDocumentSnapshot<DocumentData>} snapshot - El snapshot del documento de Firestore.
 * @returns {Employee} El objeto de empleado convertido.
 */
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

/**
 * Prepara una asignación fija para ser guardada en Firestore.
 * Se asegura de que solo los campos relevantes y con valor se incluyan.
 * `endDate` y `description` se omiten si están vacíos o no definidos.
 *
 * @param {FixedAssignment} assignment - La asignación fija a procesar.
 * @returns {Partial<FixedAssignment>} Un objeto parcial de asignación fija, listo para ser limpiado y guardado.
 */
const cleanFixedAssignmentForFirestore = (assignment: FixedAssignment): Partial<FixedAssignment> => {
  const cleanedAssignment: Partial<FixedAssignment> = {
    type: assignment.type,
    startDate: assignment.startDate,
  };
  if (assignment.endDate && typeof assignment.endDate === 'string' && assignment.endDate.trim() !== "") {
    cleanedAssignment.endDate = assignment.endDate;
  }
  if (assignment.description && typeof assignment.description === 'string' && assignment.description.trim() !== "") {
    cleanedAssignment.description = assignment.description;
  }
  return cleanedAssignment;
};

/**
 * Obtiene todos los empleados de la base de datos, ordenados por nombre.
 *
 * @async
 * @returns {Promise<Employee[]>} Una promesa que se resuelve con un array de objetos `Employee`.
 */
export const getEmployees = async (): Promise<Employee[]> => {
  const employeesCol = collection(db, EMPLOYEES_COLLECTION);
  const q = query(employeesCol, orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(fromFirestore);
};

/**
 * Añade un nuevo empleado a la base de datos.
 * Normaliza y limpia los datos antes de guardarlos, aplicando valores por defecto donde sea necesario.
 *
 * @async
 * @param {Omit<Employee, 'id'>} employeeData - Los datos del empleado a añadir (sin el `id`).
 * @returns {Promise<Employee>} Una promesa que se resuelve con el objeto `Employee` recién creado, incluyendo su `id`.
 */
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

  const returnedEmployee: Employee = {
    id: docRef.id,
    name: cleanedData.name as string,
    contact: cleanedData.contact as string,
    serviceIds: cleanedData.serviceIds as string[],
    roles: cleanedData.roles as string[],
    availability: cleanedData.availability as string,
    constraints: cleanedData.constraints as string,
    preferences: cleanedData.preferences as EmployeePreferences,
    fixedAssignments: (cleanedData.fixedAssignments || []) as FixedAssignment[],
  };

  if (returnedEmployee.fixedAssignments && returnedEmployee.fixedAssignments.length === 0) {
    returnedEmployee.fixedAssignments = undefined;
  }
  
  return returnedEmployee;
};

/**
 * Actualiza un empleado existente en la base de datos.
 * Maneja la actualización de campos anidados como `preferences` y `fixedAssignments`,
 * aplicando valores por defecto y limpiando los datos antes de guardarlos.
 *
 * @async
 * @param {string} employeeId - El ID del empleado a actualizar.
 * @param {Partial<Omit<Employee, 'id'>>} employeeData - Los datos del empleado a actualizar. Pueden ser parciales.
 * @returns {Promise<void>} Una promesa que se resuelve cuando la actualización se completa.
 */
export const updateEmployee = async (employeeId: string, employeeData: Partial<Omit<Employee, 'id'>>): Promise<void> => {
  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);

  let dataToUpdate: Partial<Omit<Employee, 'id'>> = { ...employeeData };

  if (employeeData.hasOwnProperty('preferences')) {
    const newPrefs = employeeData.preferences || {};
    dataToUpdate.preferences = {
        eligibleForDayOffAfterDuty: newPrefs.eligibleForDayOffAfterDuty ?? defaultPreferences.eligibleForDayOffAfterDuty,
        prefersWeekendWork: newPrefs.prefersWeekendWork ?? defaultPreferences.prefersWeekendWork,
        fixedWeeklyShiftDays: newPrefs.fixedWeeklyShiftDays || defaultPreferences.fixedWeeklyShiftDays,
        fixedWeeklyShiftTiming: newPrefs.fixedWeeklyShiftTiming === undefined ? defaultPreferences.fixedWeeklyShiftTiming : newPrefs.fixedWeeklyShiftTiming,
        workPattern: (newPrefs.workPattern === 'standardRotation' ? null : newPrefs.workPattern) ?? defaultPreferences.workPattern,
    };
  }

  if (employeeData.hasOwnProperty('fixedAssignments')) {
    dataToUpdate.fixedAssignments = (employeeData.fixedAssignments || []).map(cleanFixedAssignmentForFirestore);
  }

  await updateDoc(employeeDoc, cleanDataForFirestore(dataToUpdate));
};

/**
 * Elimina un empleado de la base de datos.
 *
 * @async
 * @param {string} employeeId - El ID del empleado a eliminar.
 * @returns {Promise<void>} Una promesa que se resuelve cuando la eliminación se completa.
 */
export const deleteEmployee = async (employeeId: string): Promise<void> => {
  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);
  await deleteDoc(employeeDoc);
};
