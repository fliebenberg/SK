import { Link, Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-900 p-5">
        <Text className="text-2xl font-bold font-inter text-slate-900 dark:text-white">
          This screen doesn't exist.
        </Text>
        <Link href="/" style={styles.link}>
          <Text className="text-brand-blue font-inter">Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
