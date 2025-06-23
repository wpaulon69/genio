import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combina múltiples valores de clase de Tailwind CSS en una sola cadena,
 * resolviendo conflictos de utilidad de manera inteligente.
 * Es una envoltura alrededor de `clsx` y `tailwind-merge`.
 *
 * @param {...ClassValue} inputs - Una secuencia de valores de clase. Pueden ser cadenas, arrays u objetos.
 * @returns {string} Una cadena con las clases combinadas y optimizadas.
 * @example
 * cn("p-4", "font-bold", { "bg-red-500": isError }, ["m-2", "text-lg"]);
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Limpia un objeto de datos eliminando cualquier propiedad cuyo valor sea `undefined`.
 * Esto es útil antes de enviar datos a Firestore, ya que Firestore no permite
 * valores `undefined` directamente y puede causar errores o comportamientos inesperados.
 *
 * @template T - El tipo del objeto de datos de entrada. Debe ser un objeto Record.
 * @param {T} data - El objeto de datos a limpiar.
 * @returns {Record<string, any>} Un nuevo objeto con solo las propiedades que no eran `undefined`.
 *                                 Los valores `null` se conservan.
 */
export function cleanDataForFirestore<T extends Record<string, any>>(data: T): Record<string, any> {
  const cleaned: Record<string, any> = {};
  // eslint-disable-next-line no-for-in-array
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined) {
      cleaned[key] = data[key];
    }
  }
  return cleaned;
}
