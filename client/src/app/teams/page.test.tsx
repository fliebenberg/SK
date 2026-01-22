import { render, screen } from '@testing-library/react';
import TeamsPage from './page';
import { store } from '@/app/store/store';

// Mock the store
jest.mock('@/lib/store', () => ({
  store: {
    getTeams: jest.fn(),
    getSport: jest.fn(),
  },
}));

// Mock next/link since it's used in the component
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>;
  };
});

describe('TeamsPage', () => {
  it('renders a list of teams', () => {
    (store.getTeams as jest.Mock).mockReturnValue([
      { id: '1', name: 'Team A', sportId: 'sport-soccer', ageGroup: 'U19' },
      { id: '2', name: 'Team B', sportId: 'sport-rugby', ageGroup: 'U16' },
    ]);
    (store.getSport as jest.Mock).mockImplementation((id) => {
      if (id === 'sport-soccer') return { id: 'sport-soccer', name: 'Soccer' };
      if (id === 'sport-rugby') return { id: 'sport-rugby', name: 'Rugby' };
      return undefined;
    });

    render(<TeamsPage />);

    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('Team B')).toBeInTheDocument();
    expect(screen.getByText(/Soccer/)).toBeInTheDocument();
    expect(screen.getByText(/U19/)).toBeInTheDocument();
  });

  it('renders empty state when no teams exist', () => {
    (store.getTeams as jest.Mock).mockReturnValue([]);

    render(<TeamsPage />);

    expect(screen.getByText(/no teams found/i)).toBeInTheDocument();
  });
});
