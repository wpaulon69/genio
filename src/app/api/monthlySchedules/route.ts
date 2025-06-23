import {
  getMonthlySchedules,
  createMonthlySchedule,
  // updateMonthlySchedule,
  // deleteMonthlySchedule,
} from '@/lib/mysql/monthlySchedules';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year') || undefined;
    const month = searchParams.get('month') || undefined;
    const serviceId = searchParams.get('serviceId') || undefined;
    const status = searchParams.get('status') || undefined;

    const schedules = await getMonthlySchedules(year, month, serviceId, status);
    return NextResponse.json(schedules);
  } catch (error) {
    console.error('Error in GET /api/monthlySchedules:', error);
    return NextResponse.json({ message: 'Error fetching schedules' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newScheduleId = await createMonthlySchedule(body);
    return NextResponse.json({ id: newScheduleId }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/monthlySchedules:', error);
    return NextResponse.json({ message: 'Error creating schedule' }, { status: 500 });
  }
}

// Las funciones PUT, DELETE se omiten por simplicidad,
// ya que la lógica de creación/actualización está en el generador de horarios.
