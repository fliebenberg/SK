import React, { useState, useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { ListPager } from './ListPager';


export interface PaginatedListProps<T> {
  data: T[];
  renderItem: (item: T, index: number, isMultiColumn: boolean) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  pageSize?: number;        // Base items per column (default: 50)
  maxColumns?: number;      // Maximum columns on wide screens (default: 1)
  emptyState?: React.ReactNode;
  header?: React.ReactNode;
  containerClassName?: string;
  itemSpacingClassName?: string;
}

export function PaginatedList<T>({
  data,
  renderItem,
  keyExtractor,
  pageSize = 50,
  maxColumns = 1,
  emptyState,
  header,
  containerClassName = '',
  itemSpacingClassName = 'gap-1',
}: PaginatedListProps<T>) {
  const { width } = useWindowDimensions();
  const [currentPage, setCurrentPage] = useState(1);

  // Determine active columns based on viewport width and maxColumns prop
  let activeColumns = 1;
  if (maxColumns > 1) {
    if (width >= 1280 && maxColumns >= 3) {
      activeColumns = 3;
    } else if (width >= 768 && maxColumns >= 2) {
      activeColumns = 2;
    }
  }

  const effectivePageSize = pageSize * activeColumns;
  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / effectivePageSize));

  // Sync state when currentPage or bounds change
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalItems, totalPages, currentPage, effectivePageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [data]);

  const startIndex = (currentPage - 1) * effectivePageSize;
  const endIndex = Math.min(startIndex + effectivePageSize, totalItems);
  const currentSlice = data.slice(startIndex, endIndex);

  const showPagination = totalItems > effectivePageSize;

  return (
    <View className={`w-full ${containerClassName}`}>
      {header}

      <View className={showPagination ? 'mb-3' : ''}><ListPager page={currentPage} limit={effectivePageSize} total={totalItems} onPageChange={setCurrentPage} /></View>

      {totalItems === 0 ? (
        emptyState || null
      ) : activeColumns === 1 ? (
        <View className={itemSpacingClassName}>
          {currentSlice.map((item, index) => (
            <React.Fragment key={keyExtractor(item, startIndex + index)}>
              {renderItem(item, startIndex + index, false)}
            </React.Fragment>
          ))}
        </View>
      ) : (
        <View className="flex-row flex-wrap -mx-1">
          {currentSlice.map((item, index) => {
            const colWidthClass = activeColumns === 3 ? 'w-full md:w-1/2 lg:w-1/3' : 'w-full md:w-1/2';
            return (
              <View key={keyExtractor(item, startIndex + index)} className={`${colWidthClass} px-1 mb-1.5`}>
                {renderItem(item, startIndex + index, true)}
              </View>
            );
          })}
        </View>
      )}

      <View className="mt-3"><ListPager page={currentPage} limit={effectivePageSize} total={totalItems} onPageChange={setCurrentPage} /></View>
    </View>
  );
}
