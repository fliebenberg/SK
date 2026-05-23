import { View, Text } from 'react-native';

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
      <Text className="font-orbitron text-4xl text-brand-orange font-bold tracking-widest mb-2">
        SCOREKEEPER
      </Text>
      <Text className="font-inter text-slate-600 dark:text-slate-400 text-base text-center">
        Live Games Feed
      </Text>
    </View>
  );
}
