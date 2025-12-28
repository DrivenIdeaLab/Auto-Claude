import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { AlertCircle, CreditCard, ExternalLink } from 'lucide-react';
import { useRateLimitStore } from '../stores/rate-limit-store';

export function CostLimitModal() {
  const isOpen = useRateLimitStore((state) => state.isCostLimitModalOpen);
  const costLimitInfo = useRateLimitStore((state) => state.costLimitInfo);
  const hideModal = useRateLimitStore((state) => state.hideCostLimitModal);

  if (!isOpen || !costLimitInfo) return null;

  return (
    <Dialog open={isOpen} onOpenChange={hideModal}>
      <DialogContent className="sm:max-w-md border-red-200">
        <DialogHeader>
          <div className="flex items-center gap-2 text-red-600 mb-2">
            <AlertCircle className="h-6 w-6" />
            <DialogTitle>Credit Balance Too Low</DialogTitle>
          </div>
          <DialogDescription className="text-base pt-2">
            {costLimitInfo.message}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-red-50 dark:bg-red-950/20 p-4 rounded-md border border-red-100 dark:border-red-900/30 my-2">
          <p className="text-sm text-red-800 dark:text-red-200">
            Anthropic API requests are being blocked because your account balance is insufficient.
            You need to add credits to continue using Claude.
          </p>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={hideModal}>
            Dismiss
          </Button>
          <Button 
            className="gap-2 bg-red-600 hover:bg-red-700 text-white"
            onClick={() => {
              window.electronAPI.openExternal('https://console.anthropic.com/settings/plans');
              hideModal();
            }}
          >
            <CreditCard className="h-4 w-4" />
            Add Credits
            <ExternalLink className="h-3 w-3 opacity-70" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
