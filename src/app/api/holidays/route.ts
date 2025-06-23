import {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
} from '@/lib/mysql/holidays';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const holidays = await getHolidays();
    return NextResponse.json(holidays);
  } catch (error) {
    console.error('Error in GET /api/holidays:', error);
    return NextResponse.json({ message: 'Error fetching holidays' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newHolidayId = await createHoliday(body);
    return NextResponse.json({ id: newHolidayId }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/holidays:', error);
    return NextResponse.json({ message: 'Error creating holiday' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) {
      return NextResponse.json({ message: 'Holiday ID is required' }, { status: 400 });
    }
    await updateHoliday(id, data);
    return NextResponse.json({ message: 'Holiday updated successfully' });
  } catch (error) {
    console.error('Error in PUT /api/holidays:', error);
    return NextResponse.json({ message: 'Error updating holiday' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ message: 'Holiday ID is required' }, { status: 400 });
    }
    await deleteHoliday(Number(id));
    return NextResponse.json({ message: 'Holiday deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/holidays:', error);
    return NextResponse.json({ message: 'Error deleting holiday' }, { status: 500 });
  }
}
