import React from 'react';
import { Game } from '@sk/types';

export default function AthleticsStartList({ game }: { game: Game }) {
    // Mock athletes list for the multi-competitor layout
    const athletes = [
        { lane: 1, name: 'S. Kiptoo', org: 'Nairobi AC', pb: '13:05' },
        { lane: 2, name: 'J. Cheptegei', org: 'Kampala Harriers', pb: '12:35' },
        { lane: 3, name: 'M. Farah', org: 'London Distance', pb: '12:53' },
        { lane: 4, name: 'H. Gebrselassie', org: 'Addis Ababa RC', pb: '12:39' },
    ];

    return (
        <div className="flex flex-col gap-4">
            <h3 className="font-semibold text-lg border-b pb-2">Start List (5000m)</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 bg-gray-50 uppercase">
                        <tr>
                            <th className="px-4 py-2">Lane/Bib</th>
                            <th className="px-4 py-2">Athlete</th>
                            <th className="px-4 py-2">Organization</th>
                            <th className="px-4 py-2 text-right">Seed/PB</th>
                        </tr>
                    </thead>
                    <tbody>
                        {athletes.map(a => (
                            <tr key={a.lane} className="border-b">
                                <td className="px-4 py-3 font-mono text-gray-500">{a.lane}</td>
                                <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                                <td className="px-4 py-3 text-gray-600">{a.org}</td>
                                <td className="px-4 py-3 font-mono text-right text-gray-500">{a.pb}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
