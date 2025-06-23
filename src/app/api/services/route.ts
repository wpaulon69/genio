import {
  getServices,
  createService,
  updateService,
  deleteService,
} from '@/lib/mysql/services';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const services = await getServices();
    console.log("Services from getServices:", services);
    return NextResponse.json(services);
  } catch (error) {
    console.error('Error in GET /api/services:', error);
    return NextResponse.json({ message: 'Error fetching services' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("API POST /api/services - body received:", body);
    const newServiceId = await createService(body);
    return NextResponse.json({ id: newServiceId }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/services:', error);
    return NextResponse.json({ message: 'Error creating service' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id_servicio, ...data } = body;
    if (!id_servicio) {
      return NextResponse.json({ message: 'Service ID is required' }, { status: 400 });
    }
    await updateService(id_servicio, data);
    return NextResponse.json({ message: 'Service updated successfully' });
  } catch (error) {
    console.error('Error in PUT /api/services:', error);
    return NextResponse.json({ message: 'Error updating service' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id_servicio = searchParams.get('id');
    if (!id_servicio) {
      return NextResponse.json({ message: 'Service ID is required' }, { status: 400 });
    }
    await deleteService(Number(id_servicio));
    return NextResponse.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/services:', error);
    return NextResponse.json({ message: 'Error deleting service' }, { status: 500 });
  }
}
