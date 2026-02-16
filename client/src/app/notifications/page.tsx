"use client";

import React, { useEffect, useState } from "react";
import { store } from "@/app/store/store";
import { Notification } from "@sk/types";
import { MetalCard } from "@/components/ui/metal-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { Bell, Trash2, CheckCircle, ExternalLink, Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";

export default function NotificationsPage() {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const updateNotifications = () => {
      setNotifications(store.notifications);
    };

    store.fetchNotifications(user.id);
    updateNotifications();

    return store.subscribe(updateNotifications);
  }, [isAuthenticated, user]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await store.markNotificationAsRead(id);
    } catch (error) {
      toast({ title: "Error", description: "Failed to mark as read", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await store.deleteNotification(id);
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete notification", variant: "destructive" });
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    try {
      await store.markAllNotificationsAsRead(user.id);
    } catch (error) {
      toast({ title: "Error", description: "Failed to mark all as read", variant: "destructive" });
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      handleMarkAsRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto py-10 text-center">
        <h1 className="text-2xl font-bold mb-4">Please log in to view notifications</h1>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <Bell className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        </div>
        {notifications.some(n => !n.isRead) && (
          <Button variant="outline" onClick={handleMarkAllAsRead}>
            Mark all as read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <MetalCard className="p-12 text-center flex flex-col items-center gap-4">
          <Inbox className="w-12 h-12 text-muted-foreground opacity-20" />
          <p className="text-muted-foreground text-lg">No notifications yet.</p>
        </MetalCard>
      ) : (
        <div className="grid gap-4">
          {notifications.map((notification) => (
            <MetalCard 
              key={notification.id} 
              className={`p-4 transition-all hover:bg-accent/50 cursor-pointer border-l-4 ${notification.isRead ? 'border-l-transparent' : 'border-l-primary'}`}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="flex justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={`font-semibold ${notification.isRead ? 'text-foreground/70' : 'text-foreground'}`}>
                      {notification.title}
                    </h3>
                    {!notification.isRead && <span className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {notification.message}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}</span>
                    <span className="capitalize px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                        {notification.type.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2" onClick={(e) => e.stopPropagation()}>
                    {!notification.isRead && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleMarkAsRead(notification.id)}
                            title="Mark as read"
                        >
                            <CheckCircle className="w-4 h-4" />
                        </Button>
                    )}
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDelete(notification.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Delete"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
              </div>
            </MetalCard>
          ))}
        </div>
      )}
    </div>
  );
}
