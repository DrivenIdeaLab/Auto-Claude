import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Clock, Play, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ScheduledRestartProps {
  taskId: string;
  fireAt: string;
  onRunNow: () => void;
  onCancel: () => void;
}

export function ScheduledRestart({ taskId, fireAt, onRunNow, onCancel }: ScheduledRestartProps) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const fireDate = new Date(fireAt);
      if (fireDate > now) {
        setTimeLeft(formatDistanceToNow(fireDate, { addSuffix: true }));
      } else {
        setTimeLeft('any moment now');
      }
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [fireAt]);

  return (
    <Card className="border-blue-500/30 bg-blue-500/5 mb-4">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-blue-500/10 text-blue-500">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-medium text-sm">Rate Limit Paused</h4>
            <p className="text-xs text-muted-foreground">
              Resuming automatically {timeLeft}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onCancel}
            className="h-8 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={onRunNow}
            className="h-8 bg-blue-600 hover:bg-blue-700"
          >
            <Play className="w-3 h-3 mr-1.5" />
            Run Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
