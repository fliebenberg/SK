"use client";

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { User, LogIn, UserPlus, LogOut, Settings, Palette } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { store } from '@/app/store/store';
import { useState, useEffect } from 'react';

import { UserAvatar } from '@/components/UserAvatar';

export function UserMenu() {
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [canSeeAdmin, setCanSeeAdmin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setCanSeeAdmin(false);
      return;
    }

    const update = () => {
      setCanSeeAdmin(isAuthenticated);
    };

    update();
    return store.subscribe(update);
  }, [isAuthenticated, user]);

  const handleLogout = async () => {
    await logout();
  };

  if (!isAuthenticated) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-accent"
            aria-label="User menu"
          >
            <User className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer flex items-center gap-2">
              <Palette className="h-4 w-4" />
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent sideOffset={2} alignOffset={-5} collisionPadding={16}>
              <DropdownMenuItem onClick={() => setTheme("dark-green")} className="cursor-pointer">
                Dark (Green)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark-orange")} className="cursor-pointer">
                Dark (Orange)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("light-orange")} className="cursor-pointer">
                Light (Orange)
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/login" className="cursor-pointer flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              <span>Log In</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/signup" className="cursor-pointer flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              <span>Sign Up</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover:bg-accent p-0 overflow-hidden"
          aria-label="User menu"
        >
          <UserAvatar 
            name={user?.name} 
            image={user?.image} 
            size="sm" 
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 md:w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none truncate">{user?.name || 'User'}</p>
            <p className="text-xs leading-none text-muted-foreground truncate">
              {user?.email || ''}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="cursor-pointer flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>Profile</span>
          </Link>
        </DropdownMenuItem>
        
        {canSeeAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin" className="cursor-pointer flex items-center gap-2 font-semibold">
              <Settings className="h-4 w-4 text-primary" />
              <span>Admin Dashboard</span>
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer flex items-center gap-2">
            <Palette className="h-4 w-4" />
            <span>Theme</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent sideOffset={2} alignOffset={-5} collisionPadding={16}>
            <DropdownMenuItem onClick={() => setTheme("dark-green")} className="cursor-pointer">
              Dark (Green)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark-orange")} className="cursor-pointer">
              Dark (Orange)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("light-orange")} className="cursor-pointer">
              Light (Orange)
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer flex items-center gap-2 text-muted-foreground focus:text-foreground font-medium"
        >
          <LogOut className="h-4 w-4" />
          <span>Log Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
