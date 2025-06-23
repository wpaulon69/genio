import mysql from 'mysql2/promise';

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'your_user',
  password: process.env.MYSQL_PASSWORD || 'your_password',
  database: process.env.MYSQL_DATABASE || 'your_database',
  timezone: 'UTC'
};

import type { AIShift } from '@/lib/types';

export async function getShifts(): Promise<AIShift[]> {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [rows] = await connection.execute('SELECT * FROM `horario_detalles`');
    await connection.end();
    return rows as AIShift[];
  } catch (error) {
    console.error("Error getting shifts:", error);
    await connection.end();
    throw error;
  }
}

export async function createShift(shift: Omit<AIShift, 'id'>) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [result] = await connection.execute(
      'INSERT INTO `horario_detalles` (employeeName, serviceName, date, startTime, endTime, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [shift.employeeName, shift.serviceName, shift.date, shift.startTime, shift.endTime, shift.notes]
    );
    await connection.end();
    return (result as any).insertId;
  } catch (error) {
    console.error("Error creating shift:", error);
    await connection.end();
    throw error;
  }
}

export async function updateShift(id: number, shift: Omit<AIShift, 'id'>) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [result] = await connection.execute(
      'UPDATE `horario_detalles` SET employeeName = ?, serviceName = ?, date = ?, startTime = ?, endTime = ?, notes = ? WHERE id = ?',
      [shift.employeeName, shift.serviceName, shift.date, shift.startTime, shift.endTime, shift.notes, id]
    );
    await connection.end();
    return result;
  } catch (error) {
    console.error("Error updating shift:", error);
    await connection.end();
    throw error;
  }
}

export async function deleteShift(id: number) {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const [result] = await connection.execute('DELETE FROM `horario_detalles` WHERE id = ?', [id]);
    await connection.end();
    return result;
  } catch (error) {
    console.error("Error deleting shift:", error);
    await connection.end();
    throw error;
  }
}
