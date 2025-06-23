import mysql from 'mysql2/promise';
import type { TipoAsignacion } from '@/lib/types';

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

export async function getAssignmentTypes(): Promise<TipoAsignacion[]> {
  const connection = await getConnection();
  try {
    const [rows] = await connection.execute('SELECT * FROM tipos_asignacion');
    return rows as TipoAsignacion[];
  } finally {
    await connection.end();
  }
}
