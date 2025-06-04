import Link from 'next/link';
import PageHeader from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UsersRound, BriefcaseMedical, CalendarDays, LineChart, ArrowRight } from 'lucide-react';
import Image from 'next/image';

export default function DashboardPage() {
  const features = [
    {
      title: 'Manage Services',
      description: 'Define and organize hospital services.',
      icon: BriefcaseMedical,
      href: '/services',
      img: 'https://placehold.co/600x400.png',
      aiHint: 'medical services'
    },
    {
      title: 'Manage Employees',
      description: 'Keep track of all staff members and their roles.',
      icon: UsersRound,
      href: '/employees',
      img: 'https://placehold.co/600x400.png',
      aiHint: 'hospital staff'
    },
    {
      title: 'Shift Schedule',
      description: 'View and generate shift schedules intelligently.',
      icon: CalendarDays,
      href: '/schedule',
      img: 'https://placehold.co/600x400.png',
      aiHint: 'calendar schedule'
    },
    {
      title: 'Reports & Analytics',
      description: 'Gain insights into staff utilization and operations.',
      icon: LineChart,
      href: '/reports',
      img: 'https://placehold.co/600x400.png',
      aiHint: 'data charts'
    },
  ];

  return (
    <div className="container mx-auto">
      <PageHeader
        title="Welcome to ShiftFlow"
        description="Your intelligent solution for hospital shift scheduling."
      />
      
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2">
        {features.map((feature) => (
          <Card key={feature.href} className="overflow-hidden hover:shadow-lg transition-shadow duration-300">
            <CardHeader className="p-0">
               <Image 
                src={feature.img} 
                alt={feature.title}
                width={600}
                height={400}
                className="w-full h-48 object-cover"
                data-ai-hint={feature.aiHint}
              />
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center mb-3">
                <feature.icon className="h-8 w-8 text-primary mr-3" />
                <CardTitle className="font-headline text-xl">{feature.title}</CardTitle>
              </div>
              <CardDescription className="mb-4 min-h-[40px]">{feature.description}</CardDescription>
              <Button asChild variant="outline" className="w-full">
                <Link href={feature.href}>
                  Go to {feature.label || feature.title.split(' ')[1]}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
