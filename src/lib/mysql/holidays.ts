import mysql from 'mysql2/promise';
import type { Holiday } from '@/lib/types';

const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'your_user',
  password: process.env.MYSQL_PASSWORD || 'your_password',
  database: process.env.MYSQL_DATABASE || 'your_database',
  timezone: 'UTC'
};

async function getConnection() {
  return await mysql.createConnection(dbConfig);
}

export async function getHolidays(): Promise<Holiday[]> {
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute('SELECT id, DATE_FORMAT(date, "%Y-%m-%d") as date, name FROM holidays');
    return rows as Holiday[];
  } finally {
    await connection.end();
  }
}

export async function createHoliday(holiday: Omit<Holiday, 'id'>): Promise<number> {
  const connection = await getConnection();
  try {
    const [result] = await connection.execute(
      'INSERT INTO holidays (date, name) VALUES (?, ?)',
      [holiday.date, holiday.name]
    );
    return (result as any).insertId;
  } finally {
    await connection.end();
  }
}

export async function updateHoliday(id: number, holiday: Omit<Holiday, 'id'>): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(
      'UPDATE holidays SET date = ?, name = ? WHERE id = ?',
      [holiday.date, holiday.name, id]
    );
  } finally {
    await connection.end();
  }
}

export async function deleteHoliday(id: number): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute('DELETE FROM holidays WHERE id = ?', [id]);
  } finally {
    await connection.end();
  }
}
