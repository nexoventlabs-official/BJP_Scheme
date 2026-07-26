import React from 'react';
import { Clock, CheckCircle2, PhoneCall, RefreshCw, XCircle } from 'lucide-react';

const StatusBadge = ({ status }) => {
  let badgeClass = 'tag-sunlit';
  let Icon = Clock;
  let label = status || 'Pending';

  switch (status) {
    case 'Pending':
      badgeClass = 'tag-sunlit';
      Icon = Clock;
      break;
    case 'Submitted':
      badgeClass = 'tag-sunlit';
      Icon = RefreshCw;
      break;
    case 'Processing':
    case 'In Progress':
    case 'Called':
      badgeClass = 'tag-muted';
      Icon = PhoneCall;
      break;
    case 'Completed':
    case 'Verified':
    case 'Approved':
      badgeClass = 'tag-success';
      Icon = CheckCircle2;
      break;
    case 'Rejected':
      badgeClass = 'tag-error';
      Icon = XCircle;
      break;
    default:
      badgeClass = 'tag-sunlit';
      Icon = Clock;
  }

  return (
    <span className={`tag-pill ${badgeClass}`}>
      <Icon size={12} />
      {label}
    </span>
  );
};

export default StatusBadge;
