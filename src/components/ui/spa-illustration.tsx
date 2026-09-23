import { cn } from "@/lib/utils/cn";

// One orchid bloom: two upper petals, two side petals, a lip and a centre.
function Orchid({ x, y, scale = 1, rotate = 0 }: { x: number; y: number; scale?: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <ellipse cx="0" cy="-9" rx="5.5" ry="9" className="fill-surface stroke-lilac-200" strokeWidth="0.8" />
      <ellipse cx="-9" cy="-1" rx="9" ry="6" transform="rotate(-18 -9 -1)" className="fill-surface stroke-lilac-200" strokeWidth="0.8" />
      <ellipse cx="9" cy="-1" rx="9" ry="6" transform="rotate(18 9 -1)" className="fill-surface stroke-lilac-200" strokeWidth="0.8" />
      <ellipse cx="-5" cy="7" rx="5" ry="7" transform="rotate(25 -5 7)" className="fill-surface stroke-lilac-200" strokeWidth="0.8" />
      <ellipse cx="5" cy="7" rx="5" ry="7" transform="rotate(-25 5 7)" className="fill-surface stroke-lilac-200" strokeWidth="0.8" />
      <path d="M-3.5 2.5 Q0 9 3.5 2.5 Z" className="fill-blush-500" />
      <circle cx="0" cy="0" r="2" className="fill-plum-500" />
    </g>
  );
}

// Decorative spa scene inside an arch: lilac sky, pale moon, stacked stones,
// orchid stems with white flowers and soft water lines. All colours are
// design tokens (fill-*/stroke-* utilities); size it with className.
export function SpaIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 420"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={cn("h-auto w-full", className)}
    >
      {/* Arch background */}
      <path d="M0 420V150a150 150 0 0 1 300 0v270Z" className="fill-lilac-100" />
      <path d="M22 420V160a128 128 0 0 1 256 0v260Z" className="fill-lilac-50" opacity="0.55" />

      {/* Pale moon */}
      <circle cx="198" cy="118" r="38" className="fill-surface" opacity="0.85" />
      <circle cx="198" cy="118" r="52" className="fill-surface" opacity="0.25" />

      {/* Water */}
      <path d="M0 356h300v64H0Z" className="fill-lilac-200" opacity="0.45" />
      <g className="stroke-surface" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.9">
        <path d="M34 374q14-5 28 0t28 0" />
        <path d="M150 384q16-5 32 0t32 0t30 0" />
        <path d="M58 398q12-4 24 0t24 0t24 0" />
        <path d="M196 406q12-4 24 0t24 0" />
      </g>

      {/* Orchid leaves */}
      <path d="M150 352c-26-8-52-2-70 10 22 2 46 0 70-10Z" className="fill-sage-500" opacity="0.7" />
      <path d="M156 350c24-12 52-12 72-2-22 6-48 8-72 2Z" className="fill-sage-500" opacity="0.55" />

      {/* Stacked stones */}
      <ellipse cx="112" cy="350" rx="46" ry="15" className="fill-plum-500" opacity="0.55" />
      <ellipse cx="108" cy="326" rx="34" ry="12" className="fill-brand-lilac" />
      <ellipse cx="114" cy="306" rx="24" ry="9.5" className="fill-lilac-200" />
      <ellipse cx="110" cy="290" rx="14" ry="6.5" className="fill-plum-500" opacity="0.4" />

      {/* Orchid stems */}
      <g className="stroke-plum-700" strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M168 350C170 280 192 222 236 190" />
        <path d="M162 350C156 292 140 244 104 214" />
      </g>

      {/* Orchid flowers */}
      <Orchid x={236} y={188} scale={1.05} rotate={10} />
      <Orchid x={214} y={214} scale={0.95} rotate={-8} />
      <Orchid x={193} y={248} scale={0.85} rotate={12} />
      <Orchid x={104} y={212} scale={1} rotate={-12} />
      <Orchid x={126} y={236} scale={0.85} rotate={6} />
      <Orchid x={144} y={268} scale={0.75} rotate={-6} />
    </svg>
  );
}
