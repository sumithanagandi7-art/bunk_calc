import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import AnimatedProgressRing from './AnimatedProgressRing.jsx';
import StatusBadge from './StatusBadge.jsx';

const SubjectCard = ({ subject }) => {
  const currentCalc = subject.bunk_calculations?.find(c => c.checkpoint === 'mse1') || subject.bunk_calculations?.[0];
  const pct       = currentCalc?.current_percentage ?? 0;
  const bunksLeft = currentCalc?.bunks_remaining ?? (subject.total_classes_planned ? Math.floor(subject.total_classes_planned * 0.25) : 15);
  const status    = currentCalc?.status || (currentCalc?.classes_total === 0 ? 'safe' : pct >= 75 ? 'safe' : pct >= 60 ? 'tight' : 'at_risk');

  return (
    <Link to={`/attendance/${subject.subject_id}`} className="block">
      <div className="card card-hover p-4 flex items-center gap-4 bg-white">
        <AnimatedProgressRing percentage={pct} size={70} strokeWidth={6} className="shrink-0" />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-1">
            <h3 className="text-lg font-extrabold text-gray-900 truncate leading-tight">
              {subject.subject_name || subject.name}
            </h3>
            <StatusBadge status={status} />
          </div>
          <p className="text-sm font-medium text-gray-400 mb-2 truncate">
            {subject.subject_code || subject.code || '—'}
          </p>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-bold ${bunksLeft > 0 ? 'text-gray-900' : 'text-red-500'}`}>
              {bunksLeft > 0 ? `${bunksLeft} bunks left` : '0 bunks left'}
            </span>
            <ChevronRight size={18} className="text-gray-300" />
          </div>
        </div>
      </div>
    </Link>
  );
};

export default SubjectCard;
