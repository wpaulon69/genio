
/**
 * @fileOverview Módulo para interactuar con la colección 'holidays' en Firebase Firestore.
 * Proporciona funciones CRUD (Crear, Leer, Actualizar, Eliminar) para la gestión de feriados.
 */

import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './config';
import type { Holiday } from '@/lib/types';
import { cleanDataForFirestore } from '@/lib/utils';

/** Nombre de la colección de feriados en Firestore. */
const HOLIDAYS_COLLECTION = 'holidays';

/**
 * Convierte un documento de Firestore (`QueryDocumentSnapshot`) a un objeto de tipo `Holiday`.
 *
 * @param {QueryDocumentSnapshot<DocumentData>} snapshot - El snapshot del documento de Firestore.
 * @returns {Holiday} El objeto de feriado convertido.
 */
const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Holiday => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    date: data.date, // Stored as YYYY-MM-DD string
    name: data.name,
  } as Holiday;
};

/**
 * Obtiene todos los feriados de la base de datos, ordenados por fecha.
 *
 * @async
 * @returns {Promise<Holiday[]>} Una promesa que se resuelve con un array de objetos `Holiday`.
 */
export const getHolidays = async (): Promise<Holiday[]> => {
  const holidaysCol = collection(db, HOLIDAYS_COLLECTION);
  const q = query(holidaysCol, orderBy('date')); // Order by date
  const snapshot = await getDocs(q);
  return snapshot.docs.map(fromFirestore);
};

/**
 * Añade un nuevo feriado a la base de datos.
 * Limpia los datos antes de enviarlos a Firestore.
 *
 * @async
 * @param {Omit<Holiday, 'id'>} holidayData - Los datos del feriado a añadir (sin el `id`).
 *                                            La fecha debe estar en formato YYYY-MM-DD.
 * @returns {Promise<Holiday>} Una promesa que se resuelve con el objeto `Holiday` recién creado, incluyendo su `id`.
 */
export const addHoliday = async (holidayData: Omit<Holiday, 'id'>): Promise<Holiday> => {
  const holidaysCol = collection(db, HOLIDAYS_COLLECTION);
  const dataToSave = {
    ...holidayData,
    date: typeof holidayData.date === 'string' ? holidayData.date : holidayData.date,
  };
  const cleanedData = cleanDataForFirestore(dataToSave);
  const docRef = await addDoc(holidaysCol, cleanedData);
  return { id: docRef.id, ...(cleanedData as Omit<Holiday, 'id'>) };
};

/**
 * Actualiza un feriado existente en la base de datos.
 * Limpia los datos antes de enviarlos a Firestore.
 *
 * @async
 * @param {string} holidayId - El ID del feriado a actualizar.
 * @param {Partial<Omit<Holiday, 'id'>>} holidayData - Los datos del feriado a actualizar. Pueden ser parciales.
 *                                                    Si se incluye la fecha, debe estar en formato YYYY-MM-DD.
 * @returns {Promise<void>} Una promesa que se resuelve cuando la actualización se completa.
 */
export const updateHoliday = async (holidayId: string, holidayData: Partial<Omit<Holiday, 'id'>>): Promise<void> => {
  const holidayDoc = doc(db, HOLIDAYS_COLLECTION, holidayId);
  const dataToUpdate = { ...holidayData };
  await updateDoc(holidayDoc, cleanDataForFirestore(dataToUpdate));
};

/**
 * Elimina un feriado de la base de datos.
 *
 * @async
 * @param {string} holidayId - El ID del feriado a eliminar.
 * @returns {Promise<void>} Una promesa que se resuelve cuando la eliminación se completa.
 */
export const deleteHoliday = async (holidayId: string): Promise<void> => {
  const holidayDoc = doc(db, HOLIDAYS_COLLECTION, holidayId);
  await deleteDoc(holidayDoc);
};
