import { motion } from 'framer-motion';

const StatusBadge = ({ status }) => {
  const isSafe = status === 'safe';
  const isTight = status === 'tight';
  
  let colors = 'bg-red-100 text-red-700';
  let label = 'At Risk';

  if (isSafe) {
    colors = 'bg-green-100 text-green-700';
    label = 'Safe';
  } else if (isTight) {
    colors = 'bg-yellow-100 text-yellow-700';
    label = 'Tight';
  }

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap flex items-center gap-1.5 ${colors}`}
    >
      {!isSafe && !isTight && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
      )}
      {label}
    </motion.div>
  );
};

export default StatusBadge;
