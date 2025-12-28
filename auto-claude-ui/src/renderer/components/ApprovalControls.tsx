import React, { useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';
import { ApprovalRequest, ApprovalAction } from '../../shared/constants/approval';

interface ApprovalControlsProps {
  taskId: string;
  projectId: string;
  approvalData: ApprovalRequest;
  onDecision: (action: ApprovalAction, comment?: string) => Promise<void>;
}

export function ApprovalControls({ taskId, projectId, approvalData, onDecision }: ApprovalControlsProps) {
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDecision = async (action: ApprovalAction) => {
    setLoading(true);
    try {
      await onDecision(action, comment);
      setComment('');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'rejected': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'changes_requested': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-4 h-4 mr-2" />;
      case 'rejected': return <XCircle className="w-4 h-4 mr-2" />;
      case 'changes_requested': return <AlertCircle className="w-4 h-4 mr-2" />;
      default: return <Clock className="w-4 h-4 mr-2" />;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Approval Workflow</CardTitle>
          <Badge variant="outline" className={getStatusColor(approvalData.status)}>
            <div className="flex items-center">
              {getStatusIcon(approvalData.status)}
              <span className="capitalize">{approvalData.status.replace('_', ' ')}</span>
            </div>
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Stage: <span className="font-medium text-foreground uppercase">{approvalData.stage}</span> | 
            Required Role: <span className="font-medium text-foreground capitalize">{approvalData.requiredRole.replace('_', ' ')}</span>
          </div>

          {approvalData.status === 'pending_approval' && (
            <div className="space-y-3 pt-2">
              <Textarea 
                placeholder="Add a comment (optional)..." 
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="min-h-[80px]"
              />
              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleDecision('request_changes')}
                  disabled={loading}
                  className="text-yellow-500 hover:text-yellow-600"
                >
                  Request Changes
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => handleDecision('reject')}
                  disabled={loading}
                >
                  Reject
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => handleDecision('approve')}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Approve
                </Button>
              </div>
            </div>
          )}

          {/* History */}
          {approvalData.history.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-xs font-semibold mb-3">History</h4>
              <div className="space-y-3">
                {approvalData.history.map((entry, idx) => (
                  <div key={idx} className="flex gap-3 text-sm">
                    <div className="mt-0.5">
                      {entry.action === 'approve' ? <CheckCircle className="w-4 h-4 text-green-500" /> : 
                       entry.action === 'reject' ? <XCircle className="w-4 h-4 text-red-500" /> :
                       <AlertCircle className="w-4 h-4 text-yellow-500" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{entry.actor}</span>
                        <span className="text-muted-foreground text-xs">
                          {entry.action === 'request_changes' ? 'requested changes' : entry.action + 'd'}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {new Date(entry.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      {entry.comment && (
                        <p className="text-muted-foreground mt-1 bg-muted/50 p-2 rounded text-xs">
                          {entry.comment}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
