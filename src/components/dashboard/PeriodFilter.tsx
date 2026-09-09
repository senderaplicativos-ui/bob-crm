import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export type PeriodKey = "hoje" | "ontem" | "hoje_ontem" | "7d" | "15d" | "30d" | "este_mes" | "max" | "custom";

interface Props {
  value: PeriodKey;
  onChange: (period: PeriodKey) => void;
  customStart: Date | undefined;
  customEnd: Date | undefined;
  onCustomStartChange: (d: Date | undefined) => void;
  onCustomEndChange: (d: Date | undefined) => void;
  options?: { key: PeriodKey; label: string }[];
}

const defaultOptions: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "hoje_ontem", label: "Hoje e Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "15d", label: "15 dias" },
  { key: "30d", label: "30 dias" },
  { key: "este_mes", label: "Este mês" },
  { key: "max", label: "Máximo" },
  { key: "custom", label: "Personalizado" },
];

export function getDateRange(period: PeriodKey, customStart?: Date, customEnd?: Date): { start: Date | null; end: Date | null } {
  // Use São Paulo timezone offset (UTC-3)
  const now = new Date();
  const spOffset = -3 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const spNow = new Date(utcMs + spOffset * 60000);

  const startOfDay = (d: Date) => {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    // Convert back from SP time to UTC
    return new Date(r.getTime() - spOffset * 60000 + now.getTimezoneOffset() * 60000);
  };

  const endOfDay = (d: Date) => {
    const r = new Date(d);
    r.setHours(23, 59, 59, 999);
    return new Date(r.getTime() - spOffset * 60000 + now.getTimezoneOffset() * 60000);
  };

  switch (period) {
    case "hoje":
      return { start: startOfDay(spNow), end: null };
    case "ontem": {
      const y = new Date(spNow);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case "hoje_ontem": {
      const y = new Date(spNow);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: null };
    }
    case "7d": {
      const d = new Date(spNow);
      d.setDate(d.getDate() - 7);
      return { start: startOfDay(d), end: null };
    }
    case "15d": {
      const d = new Date(spNow);
      d.setDate(d.getDate() - 15);
      return { start: startOfDay(d), end: null };
    }
    case "30d": {
      const d = new Date(spNow);
      d.setDate(d.getDate() - 30);
      return { start: startOfDay(d), end: null };
    }
    case "este_mes": {
      const d = new Date(spNow);
      d.setDate(1);
      return { start: startOfDay(d), end: null };
    }
    case "custom":
      return { start: customStart || null, end: customEnd || null };
    case "max":
    default:
      return { start: null, end: null };
  }
}

export const PeriodFilter = ({ value, onChange, customStart, customEnd, onCustomStartChange, onCustomEndChange, options }: Props) => {
  const items = options || defaultOptions;
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap gap-1">
        {items.map((opt) => (
          <Button
            key={opt.key}
            size="sm"
            variant={value === opt.key ? "default" : "outline"}
            className={cn("h-8 text-xs", value === opt.key && "bg-primary text-primary-foreground")}
            onClick={() => onChange(opt.key)}
          >
            {opt.label}
          </Button>
        ))}
      </div>
      {value === "custom" && (
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-8 w-36 justify-start text-xs", !customStart && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3 w-3" />
                {customStart ? format(customStart, "dd/MM/yyyy") : "Início"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customStart} onSelect={onCustomStartChange} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <span className="text-xs text-muted-foreground">até</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-8 w-36 justify-start text-xs", !customEnd && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3 w-3" />
                {customEnd ? format(customEnd, "dd/MM/yyyy") : "Fim"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customEnd} onSelect={onCustomEndChange} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
};
