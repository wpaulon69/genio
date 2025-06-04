"use client";

import React, { useState } from 'react';
import PageHeader from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import EmployeeList from '@/components/employees/employee-list';
import EmployeeForm from '@/components/employees/employee-form';
import type { Employee } from '@/lib/types';
import { mockEmployees, mockServices } from '@/lib/types'; // Using mock data

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>(mockEmployees);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const handleAddEmployee = (employee: Employee) => {
    if (editingEmployee) {
      setEmployees(employees.map(e => e.id === employee.id ? employee : e));
    } else {
      setEmployees([...employees, { ...employee, id: `e${employees.length + 1}` }]);
    }
    setEditingEmployee(null);
  };

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setIsFormOpen(true);
  };

  const handleDeleteEmployee = (employeeId: string) => {
    setEmployees(employees.filter(e => e.id !== employeeId));
  };
  
  const openFormForNew = () => {
    setEditingEmployee(null);
    setIsFormOpen(true);
  };

  return (
    <div className="container mx-auto">
      <PageHeader
        title="Administrar Empleados"
        description="Mantenga un directorio del personal del hospital, sus roles y preferencias."
        actions={
          <Button onClick={openFormForNew}>
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Nuevo Empleado
          </Button>
        }
      />
      <EmployeeList
        employees={employees}
        services={mockServices} // Pass services for display purposes
        onEdit={handleEditEmployee}
        onDelete={handleDeleteEmployee}
      />
      <EmployeeForm
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingEmployee(null); }}
        onSubmit={handleAddEmployee}
        employee={editingEmployee}
        availableServices={mockServices}
      />
    </div>
  );
}
