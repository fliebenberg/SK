import { View, Text } from 'react-native';

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas p-6">
      <Text className="font-orbitron-bold text-3xl sm:text-4xl text-primary-ink tracking-widest mb-2 text-center">
        SCOREKEEPER
      </Text>
      <Text className="font-inter text-ink-muted text-sm sm:text-base text-center">
        Live Games Feed
      </Text>
    </View>
  );
}
