"use client";

import {
  useCallback,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

type Ripple = { id: number; x: number; y: number; size: number };

export function useRipples() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const counter = useRef(0);

  const spawn = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.1;
    const id = counter.current++;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setRipples((prev) => [...prev.slice(-4), { id, x, y, size }]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 640);
  }, []);

  const nodes = ripples.map((r) => (
    <span
      key={r.id}
      className="ripple-dot"
      style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
    />
  ));

  return { spawn, nodes };
}

type TouchableProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function Touchable({ children, className = "", onPointerDown, ...rest }: TouchableProps) {
  const { spawn, nodes } = useRipples();
  return (
    <button
      {...rest}
      onPointerDown={(e) => {
        spawn(e);
        if (navigator.vibrate) navigator.vibrate(8);
        onPointerDown?.(e);
      }}
      className={`ripple-host press ${className}`}
    >
      {nodes}
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}

export function Panel({
  children,
  className = "",
  delay = 0,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  hover?: boolean;
}) {
  const { spawn, nodes } = useRipples();
  return (
    <section
      onPointerDown={spawn}
      className={`glass ripple-host rise rounded-3xl ${hover ? "glass-hover" : ""} ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {nodes}
      <div className="relative z-10">{children}</div>
    </section>
  );
}

export function SectionTitle({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg"
          style={{ background: "var(--accent-soft)", border: "1px solid var(--panel-border)" }}
        >
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-wide sm:text-lg">{title}</h2>
          {subtitle ? (
            <p className="text-[11px] sm:text-xs" style={{ color: "var(--muted)" }}>
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label ?? "toggle"}
      aria-pressed={checked}
      onClick={() => {
        if (navigator.vibrate) navigator.vibrate(10);
        onChange(!checked);
      }}
      className="press relative h-6 w-11 shrink-0 rounded-full border transition-colors"
      style={{
        background: checked ? "var(--accent)" : "rgba(255,255,255,0.14)",
        borderColor: "var(--panel-border)",
      }}
    >
      <span
        className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all duration-300"
        style={{ left: checked ? 24 : 3 }}
      />
    </button>
  );
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Touchable
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-medium"
      style={{
        background: active ? "var(--accent)" : "rgba(255,255,255,0.08)",
        color: active ? "#0b1020" : "var(--fg)",
        borderColor: "var(--panel-border)",
      }}
    >
      {children}
    </Touchable>
  );
}

export function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="pop rounded-2xl border p-3"
      style={{ background: "rgba(255,255,255,0.07)", borderColor: "var(--panel-border)" }}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {sub ? (
        <div className="text-[10px]" style={{ color: "var(--muted)" }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}
