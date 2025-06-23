import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from '@/lib/mysql/employees';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const employees = await getEmployees();
    return NextResponse.json(employees);
  } catch (error) {
    console.error('Error in GET /api/employees:', error);
    return NextResponse.json({ message: 'Error fetching employees' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newEmployeeId = await createEmployee(body);
    return NextResponse.json({ id: newEmployeeId }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/employees:', error);
    return NextResponse.json({ message: 'Error creating employee' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id_empleado, ...data } = body;
    if (!id_empleado) {
      return NextResponse.json({ message: 'Employee ID is required' }, { status: 400 });
    }
    await updateEmployee(Number(id_empleado), data);
    return NextResponse.json({ message: 'Employee updated successfully' });
  } catch (error) {
    console.error('Error in PUT /api/employees:', error);
    return NextResponse.json({ message: 'Error updating employee' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id_empleado = searchParams.get('id');
    if (!id_empleado) {
      return NextResponse.json({ message: 'Employee ID is required' }, { status: 400 });
    }
    await deleteEmployee(Number(id_empleado));
    return NextResponse.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/employees:', error);
    return NextResponse.json({ message: 'Error deleting employee' }, { status: 500 });
  }
}
