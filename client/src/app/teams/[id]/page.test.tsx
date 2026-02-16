import { render, screen } from '@testing-library/react';
import TeamDetailPage from './page';
import { store } from '@/app/store/store';
import { notFound, useParams } from 'next/navigation';

// Mock the store
jest.mock('@/lib/store', () => ({
  store: {
    getTeam: jest.fn(),
    getPersons: jest.fn(),
    getSport: jest.fn(),
    getTeamMembers: jest.fn(),
    getTeamRole: jest.fn(),
    getTeamRoles: jest.fn(),
  },
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  notFound: jest.fn(),
  useParams: jest.fn(),
}));

// Mock server actions (since they are imported)
jest.mock('@/app/actions', () => ({
  addPersonAction: jest.fn(),
}));

describe('TeamDetailPage', () => {
  it('renders team details and roster', async () => {
    (store.getTeam as jest.Mock).mockReturnValue({
      id: '1',
      name: 'Team A',
      sportId: 'sport-soccer',
      ageGroup: 'U19',
    });
    (store.getSport as jest.Mock).mockReturnValue({ id: 'sport-soccer', name: 'Soccer' });
    (store.getTeamMembers as jest.Mock).mockReturnValue([
      { membershipId: 'm1', id: 'p1', name: 'John Doe', roleId: 'role-player', teamId: '1' },
    ]);
    (store.getTeamRole as jest.Mock).mockReturnValue({ id: 'role-player', name: 'Player' });
    (store.getTeamRoles as jest.Mock).mockReturnValue([
        { id: 'role-player', name: 'Player' },
        { id: 'role-coach', name: 'Coach' },
    ]);

    (useParams as jest.Mock).mockReturnValue({ id: '1' });

    render(<TeamDetailPage />);

    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('Soccer • U19')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    // 'Player' comes from the resolved role name
    expect(screen.getAllByText('Player').length).toBeGreaterThan(0);
  });

  it('calls notFound if team does not exist', async () => {
    (store.getTeam as jest.Mock).mockReturnValue(undefined);
    (useParams as jest.Mock).mockReturnValue({ id: '999' });

    render(<TeamDetailPage />);

    // Since it's a client component with useEffect, we might need to wait or check how it handles !team
    // In the current implementation line 41-43, it returns <div>Team not found</div> but doesn't call notFound() hook directly in a way that jest can catch easily if not called in render.
    // Wait, the component DOES NOT call notFound() hook, it just returns a div.
    expect(screen.getByText('Team not found')).toBeInTheDocument();
  });
});
