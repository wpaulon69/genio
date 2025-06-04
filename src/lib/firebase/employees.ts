
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './config';
import type { Employee } from '@/lib/types';
import { cleanDataForFirestore } from '@/lib/utils';

const EMPLOYEES_COLLECTION = 'employees';

// Helper to convert Firestore doc to Employee type
const fromFirestore = (snapshot: QueryDocumentSnapshot<DocumentData>): Employee => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: data.name,
    contact: data.contact,
    serviceIds: data.serviceIds || [],
    roles: data.roles || [],
    preferences: data.preferences,
    availability: data.availability,
    constraints: data.constraints,
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
  const cleanedData = cleanDataForFirestore(employeeData);
  const docRef = await addDoc(employeesCol, cleanedData);
  return { id: docRef.id, ...(cleanedData as Omit<Employee, 'id'>) };
};

export const updateEmployee = async (employeeId: string, employeeData: Partial<Omit<Employee, 'id'>>): Promise<void> => {
  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);
  await updateDoc(employeeDoc, cleanDataForFirestore(employeeData));
};

export const deleteEmployee = async (employeeId: string): Promise<void> => {
  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);
  await deleteDoc(employeeDoc);
};
