import mysql from 'mysql2/promise';
import type { Employee, TurnoFijo, AsignacionEmpleado } from '@/lib/types';

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

export async function getEmployees(): Promise<Employee[]> {
  const connection = await getConnection();
  try {
    const [employeeRows] = await connection.execute('SELECT * FROM empleados');
    const employees: Employee[] = [];

    for (const empRow of employeeRows as any[]) {
      const employeeId = empRow.id_empleado;
      
      const [turnosFijos] = await connection.execute('SELECT * FROM turnos_fijos WHERE id_empleado = ?', [employeeId]);
      const [asignaciones] = await connection.execute(
        `SELECT id_asignacion, id_empleado, id_tipo_asignacion, DATE_FORMAT(fecha_inicio, '%Y-%m-%d') as fecha_inicio, DATE_FORMAT(fecha_fin, '%Y-%m-%d') as fecha_fin, descripcion 
         FROM asignaciones_empleado WHERE id_empleado = ?`,
        [employeeId]
      );

      employees.push({
        ...empRow,
        turnos_fijos: (turnosFijos as any[]) || [],
        asignaciones: (asignaciones as any[]) || [],
      });
    }
    return employees;
  } finally {
    await connection.end();
  }
}

export async function createEmployee(employee: Omit<Employee, 'id_empleado'>): Promise<number> {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const { turnos_fijos, asignaciones, ...mainEmployeeData } = employee;

    const [empResult] = await connection.execute(
      'INSERT INTO empleados (id_servicio, nombre, email_empleado, tipo_patron_trabajo, elegible_franco_pos_guardia, prefiere_trabajar_fines_semana, disponibilidad_general, restricciones_especificas) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        mainEmployeeData.id_servicio, mainEmployeeData.nombre, mainEmployeeData.email_empleado,
        mainEmployeeData.tipo_patron_trabajo, mainEmployeeData.elegible_franco_pos_guardia,
        mainEmployeeData.prefiere_trabajar_fines_semana, mainEmployeeData.disponibilidad_general,
        mainEmployeeData.restricciones_especificas
      ]
    );
    const employeeId = (empResult as any).insertId;

    if (turnos_fijos) {
      for (const turno of turnos_fijos) {
        await connection.execute('INSERT INTO turnos_fijos (id_empleado, dia_semana, tipo_turno) VALUES (?, ?, ?)', [employeeId, turno.dia_semana, turno.tipo_turno]);
      }
    }

    if (asignaciones) {
        for (const assign of asignaciones) {
            await connection.execute('INSERT INTO asignaciones_empleado (id_empleado, id_tipo_asignacion, fecha_inicio, fecha_fin, descripcion) VALUES (?, ?, ?, ?, ?)', 
            [employeeId, assign.id_tipo_asignacion, assign.fecha_inicio, assign.fecha_fin, assign.descripcion || null]);
        }
    }

    await connection.commit();
    return employeeId;
  } catch (error) {
    await connection.rollback();
    console.error("Error creating employee:", error);
    throw error;
  } finally {
    await connection.end();
  }
}

export async function updateEmployee(id: number, employee: Omit<Employee, 'id_empleado'>): Promise<void> {
    const connection = await getConnection();
    try {
        await connection.beginTransaction();

        const { turnos_fijos, asignaciones, ...mainEmployeeData } = employee;

        await connection.execute(
            'UPDATE empleados SET id_servicio = ?, nombre = ?, email_empleado = ?, tipo_patron_trabajo = ?, elegible_franco_pos_guardia = ?, prefiere_trabajar_fines_semana = ?, disponibilidad_general = ?, restricciones_especificas = ? WHERE id_empleado = ?',
            [
                mainEmployeeData.id_servicio, mainEmployeeData.nombre, mainEmployeeData.email_empleado,
                mainEmployeeData.tipo_patron_trabajo, mainEmployeeData.elegible_franco_pos_guardia,
                mainEmployeeData.prefiere_trabajar_fines_semana, mainEmployeeData.disponibilidad_general,
                mainEmployeeData.restricciones_especificas, id
            ]
        );

        await connection.execute('DELETE FROM turnos_fijos WHERE id_empleado = ?', [id]);
        if (turnos_fijos) {
            for (const turno of turnos_fijos) {
                await connection.execute('INSERT INTO turnos_fijos (id_empleado, dia_semana, tipo_turno) VALUES (?, ?, ?)', [id, turno.dia_semana, turno.tipo_turno]);
            }
        }

        await connection.execute('DELETE FROM asignaciones_empleado WHERE id_empleado = ?', [id]);
        if (asignaciones) {
            for (const assign of asignaciones) {
                await connection.execute('INSERT INTO asignaciones_empleado (id_empleado, id_tipo_asignacion, fecha_inicio, fecha_fin, descripcion) VALUES (?, ?, ?, ?, ?)', 
                [id, assign.id_tipo_asignacion, assign.fecha_inicio, assign.fecha_fin, assign.descripcion || null]);
            }
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        console.error("Error updating employee:", error);
        throw error;
    } finally {
        await connection.end();
    }
}


export async function deleteEmployee(id: number): Promise<void> {
    const connection = await getConnection();
    try {
        await connection.beginTransaction();

        await connection.execute('DELETE FROM turnos_fijos WHERE id_empleado = ?', [id]);
        await connection.execute('DELETE FROM asignaciones_empleado WHERE id_empleado = ?', [id]);
        await connection.execute('DELETE FROM empleados WHERE id_empleado = ?', [id]);

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        console.error("Error deleting employee:", error);
        throw error;
    } finally {
        await connection.end();
    }
}
