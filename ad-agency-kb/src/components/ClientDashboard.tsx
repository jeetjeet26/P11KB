"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ClientDetail } from './ClientDetail';


export function ClientDashboard() {
    const supabase = createClient();
    const [clients, setClients] = useState<any[]>([]);
    const [selectedClient, setSelectedClient] = useState<any | null>(null);
    const [newClientName, setNewClientName] = useState('');

    useEffect(() => {
        getClients();
    }, []);

    const getClients = async () => {
        const { data } = await supabase.from('clients').select('*').order('created_at');
        if (data) setClients(data);
    };

    const addClient = async () => {
        if (!newClientName) return;
        await supabase.from('clients').insert({ name: newClientName });
        setNewClientName('');
        await getClients();
    };

    if (selectedClient) {
        return <ClientDetail client={selectedClient} onBack={() => setSelectedClient(null)} />;
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
                    <div key={client.id} onClick={() => setSelectedClient(client)} className="p-6 bg-white border rounded-lg shadow cursor-pointer hover:shadow-xl transition-shadow">
                        <h3 className="text-xl font-semibold">{client.name}</h3>
                    </div>
                ))}
            </div>
        </div>
    );
} 