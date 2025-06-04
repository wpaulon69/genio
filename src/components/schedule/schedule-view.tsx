"use client";

import React, { useState, useMemo } from 'react';
import type { Shift, Employee, Service } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CalendarIcon, FilterIcon, AlertTriangle, Info } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface ScheduleViewProps {
  shifts: Shift[];
  employees: Employee[];
  services: Service[];
}

export default function ScheduleView({ shifts, employees, services }: ScheduleViewProps) {
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState<string>('');


  const getEmployeeName = (employeeId: string) => employees.find(e => e.id === employeeId)?.name || 'Unknown Employee';
  const getServiceName = (serviceId: string) => services.find(s => s.id === serviceId)?.name || 'Unknown Service';

  const filteredShifts = useMemo(() => {
    return shifts.filter(shift => {
      const matchesService = selectedService ? shift.serviceId === selectedService : true;
      const matchesEmployee = selectedEmployee ? shift.employeeId === selectedEmployee : true;
      const shiftDate = parseISO(shift.date);
      const matchesDate = selectedDate && isValid(shiftDate) ? format(shiftDate, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd') : true;
      
      const lowerSearchTerm = searchTerm.toLowerCase();
      const matchesSearch = searchTerm ? 
        getEmployeeName(shift.employeeId).toLowerCase().includes(lowerSearchTerm) ||
        getServiceName(shift.serviceId).toLowerCase().includes(lowerSearchTerm) ||
        (shift.notes && shift.notes.toLowerCase().includes(lowerSearchTerm))
        : true;

      return matchesService && matchesEmployee && matchesDate && matchesSearch;
    });
  }, [shifts, selectedService, selectedEmployee, selectedDate, searchTerm, employees, services]);

  // Placeholder for conflict detection logic
  const getConflictStatus = (shift: Shift): { hasConflict: boolean; message: string } => {
    // Example: check if employee has overlapping shifts (simplified)
    const overlapping = shifts.filter(s => 
      s.id !== shift.id &&
      s.employeeId === shift.employeeId &&
      s.date === shift.date &&
      // Basic time overlap check (does not handle overnight shifts across date boundaries well)
      !(shift.endTime <= s.startTime || shift.startTime >= s.endTime)
    );
    if (overlapping.length > 0) {
      return { hasConflict: true, message: `Overlaps with ${overlapping.length} other shift(s) for ${getEmployeeName(shift.employeeId)}.` };
    }
    return { hasConflict: false, message: '' };
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Schedule</CardTitle>
        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <Select value={selectedService} onValueChange={setSelectedService}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Filter by Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Services</SelectItem>
              {services.map(service => (
                <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Filter by Employee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Employees</SelectItem>
              {employees.map(emp => (
                <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full md:w-auto justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, 'PPP') : <span>Filter by Date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
            </PopoverContent>
          </Popover>
          
          <Input 
            placeholder="Search shifts..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-[200px]"
          />

          <Button variant="ghost" onClick={() => { setSelectedService(''); setSelectedEmployee(''); setSelectedDate(undefined); setSearchTerm(''); }}>
            <FilterIcon className="mr-2 h-4 w-4" /> Clear Filters
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {filteredShifts.length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>No Shifts Found</AlertTitle>
            <AlertDescription>
              There are no shifts matching your current filter criteria, or no shifts have been scheduled yet.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="hidden md:table-cell">Notes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredShifts.map((shift) => {
                  const conflict = getConflictStatus(shift);
                  const shiftDate = parseISO(shift.date);
                  return (
                    <TableRow key={shift.id} className={conflict.hasConflict ? 'bg-destructive/10' : ''}>
                      <TableCell>{isValid(shiftDate) ? format(shiftDate, 'MMM d, yyyy') : 'Invalid Date'}</TableCell>
                      <TableCell>{getServiceName(shift.serviceId)}</TableCell>
                      <TableCell>{getEmployeeName(shift.employeeId)}</TableCell>
                      <TableCell>{shift.startTime} - {shift.endTime}</TableCell>
                      <TableCell className="hidden md:table-cell max-w-xs truncate">{shift.notes || 'N/A'}</TableCell>
                      <TableCell>
                        {conflict.hasConflict && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/20 p-1">
                                <AlertTriangle className="h-5 w-5" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80">
                              <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Conflict Detected</AlertTitle>
                                <AlertDescription>{conflict.message}</AlertDescription>
                              </Alert>
                            </PopoverContent>
                          </Popover>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
