import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

const options = [
  { value: "light" as const, icon: Sun, label: "Claro" },
  { value: "dark" as const, icon: Moon, label: "Escuro" },
  { value: "auto" as const, icon: Monitor, label: "Auto" },
];

const ThemeToggle = () => {
  const { mode, setMode } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Selecionar tema"
      className="flex items-center gap-1 rounded-lg bg-sidebar-accent/60 p-1"
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            aria-label={`Tema ${opt.label}`}
            title={`Tema ${opt.label}`}
            onClick={() => setMode(opt.value)}
            className={cn(
              "flex h-7 flex-1 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              active
                ? "bg-sidebar-active text-white shadow-sm"
                : "text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-hover"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
};

export default ThemeToggle;
