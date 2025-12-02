'use client';
import type { TOCItemType } from 'fumadocs-core/toc';
import * as Primitive from 'fumadocs-core/toc';
import { type ComponentProps, useRef } from 'react';
import { cn } from '../../lib/cn';
import { mergeRefs } from '../../lib/merge-refs';
import { useTOCItems, TocThumb, TocItemsEmpty } from './index';

export function TOCItems({ ref, className, ...props }: ComponentProps<'div'>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const items = useTOCItems();

  if (items.length === 0) return <TocItemsEmpty />;

  return (
    <>
      <TocThumb
        containerRef={containerRef}
        className="absolute top-(--fd-top) h-(--fd-height) w-px bg-fd-primary transition-all"
        style={{ willChange: 'height, top' }}
      />
      <div
        ref={mergeRefs(ref, containerRef)}
        className={cn(
          'flex flex-col border-s border-fd-foreground/10',
          className,
        )}
        {...props}
      >
        {items.map((item) => (
          <TOCItem key={item.url} item={item} />
        ))}
      </div>
    </>
  );
}

function TOCItem({ item }: { item: TOCItemType }) {
  return (
    <Primitive.TOCItem
      href={item.url}
      className={cn(
        'prose py-1.5 text-sm text-fd-muted-foreground transition-colors [overflow-wrap:anywhere] first:pt-0 last:pb-0 data-[active=true]:text-fd-primary',
        item.depth <= 2 && 'ps-3',
        item.depth === 3 && 'ps-6',
        item.depth >= 4 && 'ps-8',
      )}
    >
      {item.title}
    </Primitive.TOCItem>
  );
}
