import React from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

/**
 * The entry grid's layout, and the only place either axis decides how it is arranged.
 *
 * Both axes are the same shape — a set of headed groups of team chips — and differ only in what a
 * group *is*: an organisation when entering by division, a division when entering by organisation.
 * So the arrangement lives here once, and the axes supply columns.
 *
 * **Columns on a wide screen, stacked sections on a phone**, rather than columns that shrink. A
 * column count is bounded by legibility, not by arithmetic: fifteen invited schools cannot be
 * fifteen columns on any screen, and two 140px columns on a phone are worse than one clear list.
 * The chip is the same component either way, so this reflows rather than branching into two
 * renderings that drift.
 *
 * **Groups with nothing to offer go underneath.** A column per division for the nine sports a
 * school does not play is a wall of "nothing qualifying" between the organiser and the six that
 * matter. But they cannot simply be dropped: an empty group is the only place a missing team gets
 * created, which is the whole reason the organisation axis exists. So they are collected below the
 * grid, compact, still complete.
 */
export interface EntrantGridGroup {
  key: string;
  /** The column heading — an org flag, or a division's name. */
  header: React.ReactNode;
  body: React.ReactNode;
  /**
   * True when this group offers nothing: no team to tick, nothing entered. Those sink below the
   * grid rather than taking a column, and render through `renderEmpty` instead of `body`.
   */
  isEmpty?: boolean;
}

export interface EntrantGridProps {
  groups: EntrantGridGroup[];
  /** Rendered under the grid for the empty groups. Given all of them at once, so it can head them. */
  renderEmpty?: (groups: EntrantGridGroup[]) => React.ReactNode;
  /** Shown when there is nothing at all — neither a filled group nor an empty one. */
  emptyText?: string;
}

/**
 * How many columns the width supports.
 *
 * The same breaks `PaginatedList` uses, one step narrower: a chip column needs less room than a
 * card, and the grid sits inside a padded card rather than the full page.
 */
function columnCount(width: number): number {
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 768) return 2;
  return 1;
}

export function EntrantGrid({ groups, renderEmpty, emptyText }: EntrantGridProps) {
  const { width } = useWindowDimensions();
  const columns = columnCount(width);

  const filled = groups.filter(group => !group.isEmpty);
  const empties = groups.filter(group => group.isEmpty);

  if (!filled.length && !empties.length) {
    return (
      <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
        {emptyText || 'Nothing to enter here yet.'}
      </Text>
    );
  }

  return (
    <View>
      {/*
        One row of wrapping cells. Width is a percentage rather than a flex basis so that a final
        row with fewer groups than columns keeps its column width instead of stretching to fill —
        three schools under a four-column layout should look like three of four, not like thirds.
      */}
      <View className="flex-row flex-wrap -mx-1.5">
        {filled.map(group => (
          <View
            key={group.key}
            style={{ width: `${100 / columns}%` }}
            className="px-1.5 mb-4"
          >
            <View className="mb-1.5">{group.header}</View>
            {group.body}
          </View>
        ))}
      </View>

      {empties.length > 0 && renderEmpty?.(empties)}
    </View>
  );
}
