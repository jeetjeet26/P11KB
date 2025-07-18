"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ClientDetail } from './ClientDetail';
import { ClientIntakeForm } from './ClientIntakeForm';

export function ClientDashboard() {
    const supabase = createClient();
    const [clients, setClients] = useState<any[]>([]);
    const [selectedClient, setSelectedClient] = useState<any | null>(null);
    const [newClientName, setNewClientName] = useState('');
    const [showIntakeForm, setShowIntakeForm] = useState<string | null>(null);
    const [clientIntakeStatus, setClientIntakeStatus] = useState<{[key: string]: boolean}>({});

    useEffect(() => {
        getClients();
    }, []);

    const getClients = async () => {
        const { data } = await supabase.from('clients').select('*').order('created_at');
        if (data) {
            setClients(data);
            await checkIntakeStatus(data);
        }
    };

    const checkIntakeStatus = async (clientList: any[]) => {
        const intakeStatusMap: {[key: string]: boolean} = {};
        
        for (const client of clientList) {
            const { data: intakeData } = await supabase
                .from('client_intake')
                .select('intake_completed')
                .eq('client_id', client.id)
                .eq('intake_completed', true)
                .maybeSingle(); // Use maybeSingle instead of single to handle no rows gracefully
            
            intakeStatusMap[client.id] = !!intakeData;
        }
        
        setClientIntakeStatus(intakeStatusMap);
    };

    const addClient = async () => {
        if (!newClientName) return;
        await supabase.from('clients').insert({ name: newClientName });
        setNewClientName('');
        await getClients();
    };

    const handleIntakeComplete = async () => {
        setShowIntakeForm(null);
        await getClients(); // Refresh to update intake status
    };

    if (selectedClient) {
        return <ClientDetail client={selectedClient} onBack={() => setSelectedClient(null)} />;
    }

    if (showIntakeForm) {
        const client = clients.find(c => c.id === showIntakeForm);
        if (client) {
            const isEditMode = clientIntakeStatus[client.id];
            return (
                <ClientIntakeForm
                    clientId={client.id}
                    clientName={client.name}
                    onComplete={handleIntakeComplete}
                    onCancel={() => setShowIntakeForm(null)}
                    editMode={isEditMode}
                />
            );
        }
    }

    return (
        <div className="w-full max-w-4xl mx-auto mt-8">
            <h2 className="text-3xl font-bold mb-6">Client Dashboard</h2>
            <div className="flex gap-4 mb-6">
                <input
                    type="text"
                    placeholder="New Client Name"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="flex-grow px-3 py-2 border rounded-md"
                />
                <button onClick={addClient} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Add Client</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {clients.map(client => (
                    <div key={client.id} className="p-6 bg-white border rounded-lg shadow hover:shadow-xl transition-shadow">
                        <div className="flex items-start justify-between mb-4">
                            <h3 className="text-xl font-semibold">{client.name}</h3>
                            {clientIntakeStatus[client.id] && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Intake Complete
                                </span>
                            )}
                        </div>
                        
                        <div className="space-y-2">
                            <button
                                onClick={() => setSelectedClient(client)}
                                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
                            >
                                View Client Details
                            </button>
                            
                            {!clientIntakeStatus[client.id] ? (
                                <button
                                    onClick={() => setShowIntakeForm(client.id)}
                                    className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:ring-2 focus:ring-green-500"
                                >
                                    Complete Client Intake
                                </button>
                            ) : (
                                <button
                                    onClick={() => setShowIntakeForm(client.id)}
                                    className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:ring-2 focus:ring-gray-500"
                                >
                                    Update Intake Info
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
} 