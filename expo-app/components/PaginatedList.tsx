import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';

export interface PaginatedListProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  pageSize?: number;
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
  emptyState,
  header,
  containerClassName = '',
  itemSpacingClassName = 'space-y-1',
}: PaginatedListProps<T>) {
  const isDark = useActiveTheme() === 'dark';
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpInput, setJumpInput] = useState('1');

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Sync state when currentPage or data bounds change
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
      setJumpInput('1');
    }
  }, [totalItems, totalPages, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
    setJumpInput('1');
  }, [data]);

  const handlePageChange = (newPage: number) => {
    const validPage = Math.min(Math.max(1, newPage), totalPages);
    setCurrentPage(validPage);
    setJumpInput(String(validPage));
  };

  const handleJumpSubmit = () => {
    const parsed = parseInt(jumpInput, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= totalPages) {
      handlePageChange(parsed);
    } else {
      setJumpInput(String(currentPage));
    }
  };

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const currentSlice = data.slice(startIndex, endIndex);

  const showPagination = totalItems > pageSize;

  return (
    <View className={`w-full ${containerClassName}`}>
      {header}

      {totalItems === 0 ? (
        emptyState || null
      ) : (
        <View className={itemSpacingClassName}>
          {currentSlice.map((item, index) => (
            <React.Fragment key={keyExtractor(item, startIndex + index)}>
              {renderItem(item, startIndex + index)}
            </React.Fragment>
          ))}
        </View>
      )}

      {showPagination && (
        <View className="mt-3 py-2 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl flex-row items-center justify-between flex-wrap gap-2 shadow-sm">
          {/* Item Count Info */}
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
            Showing{' '}
            <Text className="font-inter-bold text-slate-700 dark:text-slate-200">
              {startIndex + 1}–{endIndex}
            </Text>{' '}
            of{' '}
            <Text className="font-inter-bold text-slate-700 dark:text-slate-200">
              {totalItems}
            </Text>
          </Text>

          {/* Navigation & Jump Controls */}
          <View className="flex-row items-center gap-1.5">
            {/* First Page */}
            <TouchableOpacity
              onPress={() => handlePageChange(1)}
              disabled={currentPage === 1}
              className={`w-7 h-7 rounded-lg items-center justify-center border border-slate-200 dark:border-white/10 ${
                currentPage === 1
                  ? 'opacity-30 bg-slate-100 dark:bg-slate-800'
                  : 'bg-white dark:bg-slate-800 active:opacity-75'
              }`}
            >
              <Ionicons name="play-skip-back" size={12} color={isDark ? '#E2E8F0' : '#475569'} />
            </TouchableOpacity>

            {/* Prev Page */}
            <TouchableOpacity
              onPress={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`w-7 h-7 rounded-lg items-center justify-center border border-slate-200 dark:border-white/10 ${
                currentPage === 1
                  ? 'opacity-30 bg-slate-100 dark:bg-slate-800'
                  : 'bg-white dark:bg-slate-800 active:opacity-75'
              }`}
            >
              <Ionicons name="chevron-back" size={14} color={isDark ? '#E2E8F0' : '#475569'} />
            </TouchableOpacity>

            {/* Page Jump Input */}
            <View className="flex-row items-center gap-1 px-1">
              <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                Page
              </Text>
              <TextInput
                value={jumpInput}
                onChangeText={setJumpInput}
                onBlur={handleJumpSubmit}
                onSubmitEditing={handleJumpSubmit}
                keyboardType="number-pad"
                selectTextOnFocus
                className="w-10 h-7 text-center font-inter-bold text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-white/10 rounded-md py-0 px-1 outline-none"
              />
              <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                of {totalPages}
              </Text>
            </View>

            {/* Next Page */}
            <TouchableOpacity
              onPress={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`w-7 h-7 rounded-lg items-center justify-center border border-slate-200 dark:border-white/10 ${
                currentPage === totalPages
                  ? 'opacity-30 bg-slate-100 dark:bg-slate-800'
                  : 'bg-white dark:bg-slate-800 active:opacity-75'
              }`}
            >
              <Ionicons name="chevron-forward" size={14} color={isDark ? '#E2E8F0' : '#475569'} />
            </TouchableOpacity>

            {/* Last Page */}
            <TouchableOpacity
              onPress={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
              className={`w-7 h-7 rounded-lg items-center justify-center border border-slate-200 dark:border-white/10 ${
                currentPage === totalPages
                  ? 'opacity-30 bg-slate-100 dark:bg-slate-800'
                  : 'bg-white dark:bg-slate-800 active:opacity-75'
              }`}
            >
              <Ionicons name="play-skip-forward" size={12} color={isDark ? '#E2E8F0' : '#475569'} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
