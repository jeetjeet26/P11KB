"use client";

import { ClientDashboard } from '@/components/ClientDashboard';

export default function Page() {
  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Agency KB</h1>
      </div>
      <ClientDashboard />
    </div>
  );
} 