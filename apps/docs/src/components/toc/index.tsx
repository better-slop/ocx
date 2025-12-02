'use client';
import type { PopoverContentProps, PopoverTriggerProps } from '@radix-ui/react-popover';
import type { TOCItemType } from 'fumadocs-core/toc';
import * as Primitive from 'fumadocs-core/toc';
import { useEffectEvent } from 'fumadocs-core/utils/use-effect-event';
import { useOnChange } from 'fumadocs-core/utils/use-on-change';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import { ChevronRight, Text } from 'lucide-react';
import {
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { cn } from '../../lib/cn';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { ScrollArea, ScrollViewport } from '../ui/scroll-area';

export type { TOCItemType };

const TOCContext = createContext<TOCItemType[]>([]);

export function useTOCItems(): TOCItemType[] {
  return use(TOCContext);
}

export function TOCProvider({
  toc,
  children,
  ...props
}: ComponentProps<typeof Primitive.AnchorProvider>) {
  return (
    <TOCContext value={toc}>
      <Primitive.AnchorProvider toc={toc} {...props}>
        {children}
      </Primitive.AnchorProvider>
    </TOCContext>
  );
}

export type TOCThumb = [top: number, height: number];

function calc(container: HTMLElement, active: string[]): TOCThumb {
  if (active.length === 0 || container.clientHeight === 0) {
    return [0, 0];
  }

  let upper = Number.MAX_VALUE,
    lower = 0;

  for (const item of active) {
    const element = container.querySelector<HTMLElement>(`a[href="#${item}"]`);
    if (!element) continue;

    const styles = getComputedStyle(element);
    upper = Math.min(upper, element.offsetTop + parseFloat(styles.paddingTop));
    lower = Math.max(
      lower,
      element.offsetTop +
        element.clientHeight -
        parseFloat(styles.paddingBottom),
    );
  }

  return [upper, lower - upper];
}

function update(element: HTMLElement, info: TOCThumb): void {
  element.style.setProperty('--fd-top', `${info[0]}px`);
  element.style.setProperty('--fd-height', `${info[1]}px`);
}

export function TocThumb({
  containerRef,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  containerRef: RefObject<HTMLElement | null>;
}) {
  const active = Primitive.useActiveAnchors();
  const thumbRef = useRef<HTMLDivElement>(null);

  const onResize = useEffectEvent(() => {
    if (!containerRef.current || !thumbRef.current) return;
    update(thumbRef.current, calc(containerRef.current, active));
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    onResize();
    const observer = new ResizeObserver(onResize);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [containerRef, onResize]);

  useOnChange(active, () => {
    if (!containerRef.current || !thumbRef.current) return;

    // Skip updates during anchor scroll animation to prevent flicker
    if (document.documentElement.hasAttribute('data-anchor-scrolling')) {
      return;
    }

    update(thumbRef.current, calc(containerRef.current, active));
  });

  return <div ref={thumbRef} role="none" {...props} />;
}

export type TOCProps = {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function Toc(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      id="nd-toc"
      {...props}
      className={cn(
        'sticky top-[calc(var(--fd-banner-height)+var(--fd-nav-height))] h-(--fd-toc-height) pb-2 pt-12',
        props.className,
      )}
      style={
        {
          ...props.style,
          '--fd-toc-height':
            'calc(100dvh - var(--fd-banner-height) - var(--fd-nav-height) - 4rem)',
        } as object
      }
    >
      <div className="flex h-full w-(--fd-toc-width) max-w-full flex-col gap-3 pe-4">
        {props.children}
      </div>
    </div>
  );
}

export function TocItemsEmpty() {
  const { text } = useI18n();

  return (
    <div className="rounded-lg border bg-fd-card p-3 text-xs text-fd-muted-foreground">
      {text.tocNoHeadings}
    </div>
  );
}

export function TOCScrollArea({
  ref,
  isMenu,
  ...props
}: ComponentProps<typeof ScrollArea> & { isMenu?: boolean }) {
  const viewRef = useRef<HTMLDivElement>(null);

  return (
    <ScrollArea
      ref={ref}
      {...props}
      className={cn('flex flex-col ps-px', props.className)}
    >
      <Primitive.ScrollProvider containerRef={viewRef}>
        <ScrollViewport
          className={cn(
            'relative min-h-0 text-sm',
            isMenu && 'mt-2 mb-4 mx-4 md:mx-6',
          )}
          ref={viewRef}
        >
          {props.children}
        </ScrollViewport>
      </Primitive.ScrollProvider>
    </ScrollArea>
  );
}

type MakeRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

const PopoverContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

const TocPopoverProvider = PopoverContext.Provider || PopoverContext;

export function TocPopover({
  open,
  onOpenChange,
  ...props
}: MakeRequired<ComponentProps<typeof Collapsible>, 'open' | 'onOpenChange'>) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} {...props}>
      <TocPopoverProvider
        value={useMemo(
          () => ({
            open,
            setOpen: onOpenChange,
          }),
          [onOpenChange, open],
        )}
      >
        {props.children}
      </TocPopoverProvider>
    </Collapsible>
  );
}

export function TocPopoverTrigger({
  items,
  ...props
}: PopoverTriggerProps & { items: TOCItemType[] }) {
  const { text } = useI18n();
  const { open } = use(PopoverContext)!;
  const active = Primitive.useActiveAnchor();
  const current = useMemo(() => {
    return items.find((item) => active === item.url.slice(1))?.title;
  }, [items, active]);

  return (
    <CollapsibleTrigger
      {...props}
      className={cn(
        'inline-flex items-center text-sm gap-2 text-nowrap px-4 py-2.5 text-start md:px-6 focus-visible:outline-none',
        props.className,
      )}
    >
      <Text className="size-4 shrink-0" />
      {text.toc}
      <ChevronRight
        className={cn(
          'size-4 shrink-0 text-fd-muted-foreground transition-all',
          !current && 'opacity-0',
          open ? 'rotate-90' : '-ms-1.5',
        )}
      />
      <span
        className={cn(
          'truncate text-fd-muted-foreground transition-opacity -ms-1.5',
          (!current || open) && 'opacity-0',
        )}
      >
        {current}
      </span>
    </CollapsibleTrigger>
  );
}

export function TocPopoverContent(props: PopoverContentProps) {
  return (
    <CollapsibleContent
      data-toc-popover=""
      className="flex flex-col max-h-[50vh]"
      {...props}
    >
      {props.children}
    </CollapsibleContent>
  );
}
