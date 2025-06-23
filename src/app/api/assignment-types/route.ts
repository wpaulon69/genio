import { getAssignmentTypes } from '@/lib/mysql/assignment-types';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const assignmentTypes = await getAssignmentTypes();
    return NextResponse.json(assignmentTypes);
  } catch (error) {
    console.error('Error in GET /api/assignment-types:', error);
    return NextResponse.json({ message: 'Error fetching assignment types' }, { status: 500 });
  }
}
