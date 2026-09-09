import { cn } from "@/lib/utils";
import { getBadgeStyle } from "@/lib/colorContrast";

interface StatusBadgeProps {
  status: string;
  color?: string;
  className?: string;
}

const NOVO_COLOR = "#3B82F6";
const FALLBACK_COLOR = "#6B7280";

const StatusBadge = ({ status, color, className }: StatusBadgeProps) => {
  const bgColor = status === "NOVO" ? NOVO_COLOR : (color || FALLBACK_COLOR);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        className
      )}
      style={getBadgeStyle(bgColor)}
    >
      {status}
    </span>
  );
};

export default StatusBadge;
