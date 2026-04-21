import * as Tooltip from '@radix-ui/react-tooltip';
import { CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';

type HelpTooltipProps = {
  text?: string;
  children?: ReactNode;
  label?: string;
};

export default function HelpTooltip({
  text,
  children,
  label = 'Mostrar ayuda contextual',
}: HelpTooltipProps) {
  const content = children ?? text;

  if (!content) return null;

  return (
    <Tooltip.Provider delayDuration={120}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 transition hover:bg-cyan-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
          >
            <CircleHelp size={13} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={8}
            className="z-[100] max-w-xs rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-xs leading-relaxed text-slate-200 shadow-2xl backdrop-blur"
          >
            {content}
            <Tooltip.Arrow className="fill-slate-950/95" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
