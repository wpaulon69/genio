
/**
 * @fileOverview Módulo para interactuar con la colección 'services' en Firebase Firestore.
 * Proporciona funciones CRUD (Crear, Leer, Actualizar, Eliminar) para la gestión de servicios hospitalarios.
 */

import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './config';
import type { Service, StaffingNeeds, ConsecutivenessRules } from '@/lib/types';
import { cleanDataForFirestore } from '@/lib/utils';

/** Nombre de la colección de servicios en Firestore. */
const SERVICES_COLLECTION = 'services';

/**
 * Valores por defecto para las necesidades de personal de un servicio.
 * Utilizados si no se especifican al crear o actualizar un servicio.
 */
const defaultStaffingNeeds: StaffingNeeds = {
  morningWeekday: 0,
  afternoonWeekday: 0,
  nightWeekday: 0,
  morningWeekendHoliday: 0,
  afternoonWeekendHoliday: 0,
  nightWeekendHoliday: 0,
};

/**
 * Valores por defecto para las reglas de consecutividad de un servicio.
 * Utilizados si no se especifican.
 */
const defaultConsecutivenessRules: ConsecutivenessRules = {
  maxConsecutiveWorkDays: 6,
  preferredConsecutiveWorkDays: 5,
  maxConsecutiveDaysOff: 3,
  preferredConsecutiveDaysOff: 2,
  minConsecutiveDaysOffRequiredBeforeWork: 1,
};

/**
 * Valor por defecto para el objetivo de fines de semana completos de descanso.
 */
const defaultTargetCompleteWeekendsOff = 1;

/**
 * Convierte un documento de Firestore (`QueryDocumentSnapshot`) a un objeto de tipo `Service`.
 * Aplica valores por defecto para `staffingNeeds`, `consecutivenessRules` y `targetCompleteWeekendsOff` si no están presentes en el documento.
 *
 * @param {QueryDocumentSnapshot<DocumentData>} snapshot - El snapshot del documento de Firestore.
 * @returns {Service} El objeto de servicio convertido.
 */
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
    targetCompleteWeekendsOff: data.targetCompleteWeekendsOff === undefined ? defaultTargetCompleteWeekendsOff : data.targetCompleteWeekendsOff,
    additionalNotes: data.additionalNotes || '',
  } as Service;
};

/**
 * Obtiene todos los servicios de la base de datos, ordenados por nombre.
 *
 * @async
 * @returns {Promise<Service[]>} Una promesa que se resuelve con un array de objetos `Service`.
 */
export const getServices = async (): Promise<Service[]> => {
  const servicesCol = collection(db, SERVICES_COLLECTION);
  const q = query(servicesCol, orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(fromFirestore);
};

/**
 * Añade un nuevo servicio a la base de datos.
 * Aplica valores por defecto para campos anidados si no se proporcionan.
 * Limpia los datos antes de enviarlos a Firestore (elimina campos `undefined`).
 *
 * @async
 * @param {Omit<Service, 'id'>} serviceData - Los datos del servicio a añadir (sin el `id`).
 * @returns {Promise<Service>} Una promesa que se resuelve con el objeto `Service` recién creado, incluyendo su `id`.
 */
export const addService = async (serviceData: Omit<Service, 'id'>): Promise<Service> => {
  const servicesCol = collection(db, SERVICES_COLLECTION);
  const dataWithDefaults = {
    ...serviceData,
    staffingNeeds: { ...defaultStaffingNeeds, ...serviceData.staffingNeeds },
    consecutivenessRules: { ...defaultConsecutivenessRules, ...serviceData.consecutivenessRules },
    targetCompleteWeekendsOff: serviceData.targetCompleteWeekendsOff === undefined ? defaultTargetCompleteWeekendsOff : serviceData.targetCompleteWeekendsOff,
  };
  const cleanedData = cleanDataForFirestore(dataWithDefaults);
  const docRef = await addDoc(servicesCol, cleanedData);
  return { id: docRef.id, ...(cleanedData as Omit<Service, 'id'>) };
};

/**
 * Actualiza un servicio existente en la base de datos.
 * Si se proporcionan `staffingNeeds` o `consecutivenessRules` parciales, se fusionan con los valores por defecto
 * para evitar borrar campos no especificados dentro de estos objetos anidados.
 * Lo mismo aplica para `targetCompleteWeekendsOff`.
 * Limpia los datos antes de enviarlos a Firestore.
 *
 * @async
 * @param {string} serviceId - El ID del servicio a actualizar.
 * @param {Partial<Omit<Service, 'id'>>} serviceData - Los datos del servicio a actualizar. Pueden ser parciales.
 * @returns {Promise<void>} Una promesa que se resuelve cuando la actualización se completa.
 */
export const updateService = async (serviceId: string, serviceData: Partial<Omit<Service, 'id'>>): Promise<void> => {
  const serviceDoc = doc(db, SERVICES_COLLECTION, serviceId);
  const updateData = { ...serviceData };
  if (serviceData.staffingNeeds) {
    updateData.staffingNeeds = { ...defaultStaffingNeeds, ...serviceData.staffingNeeds };
  }
  if (serviceData.consecutivenessRules) {
    updateData.consecutivenessRules = { ...defaultConsecutivenessRules, ...serviceData.consecutivenessRules };
  }
  if (serviceData.hasOwnProperty('targetCompleteWeekendsOff')) { // Check if the property itself is present, even if undefined
    updateData.targetCompleteWeekendsOff = serviceData.targetCompleteWeekendsOff === undefined ? defaultTargetCompleteWeekendsOff : serviceData.targetCompleteWeekendsOff;
  }
  // Note: If targetCompleteWeekendsOff is not in serviceData, it won't be updated, existing value preserved.
  // If it IS in serviceData and is explicitly undefined, it will be set to default.
  // If it's in serviceData with a value, that value will be used.

  await updateDoc(serviceDoc, cleanDataForFirestore(updateData));
};

/**
 * Elimina un servicio de la base de datos.
 *
 * @async
 * @param {string} serviceId - El ID del servicio a eliminar.
 * @returns {Promise<void>} Una promesa que se resuelve cuando la eliminación se completa.
 */
export const deleteService = async (serviceId: string): Promise<void> => {
  const serviceDoc = doc(db, SERVICES_COLLECTION, serviceId);
  await deleteDoc(serviceDoc);
};

    