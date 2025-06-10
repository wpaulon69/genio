
/**
 * @fileOverview Configuración e inicialización de Firebase para la aplicación.
 * Este archivo configura la conexión a Firebase y exporta las instancias de la aplicación Firebase (`app`)
 * y Firestore (`db`) para ser utilizadas en toda la aplicación.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Objeto de configuración de Firebase.
 * Los valores se obtienen de las variables de entorno `NEXT_PUBLIC_FIREBASE_*`.
 * Estas variables deben estar definidas en el entorno de la aplicación (ej. archivo .env.local).
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/** Instancia de la aplicación Firebase. */
let app: FirebaseApp;
/** Instancia de la base de datos Firestore. */
let db: Firestore;

// Inicializa Firebase solo si no ha sido inicializado previamente (importante para HMR en Next.js).
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]; // Obtiene la instancia existente si ya fue inicializada.
}

// Obtiene la instancia de Firestore.
db = getFirestore(app);

export { app, db };
