import { View, Text } from 'react-native';

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-background p-6">
      <Text className="font-orbitron text-4xl text-brand-orange font-bold tracking-widest mb-2">
        SCOREKEEPER
      </Text>
      <Text className="font-inter text-textSecondary text-base text-center">
        Live Games Feed
      </Text>
    </View>
  );
}
