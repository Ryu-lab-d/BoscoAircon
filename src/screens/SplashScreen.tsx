import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Image, Animated, Text, Pressable } from 'react-native';

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [skipClicked, setSkipClicked] = useState(false);
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;
  const rotateAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (skipClicked) {
      onFinish();
      return;
    }

    // Logo pop-in animation
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Navigate after 3 seconds
    const timer = setTimeout(onFinish, 3000);
    return () => clearTimeout(timer);
  }, [scaleAnim, opacityAnim, rotateAnim, onFinish, skipClicked]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-180deg', '0deg'],
  });

  return (
    <View style={styles.container}>
      {/* Background circles */}
      <View style={[styles.circle, styles.circle1]} />
      <View style={[styles.circle, styles.circle2]} />
      <View style={[styles.circle, styles.circle3]} />

      {/* Close button */}
      <Pressable style={styles.closeButton} onPress={() => setSkipClicked(true)}>
        <Text style={styles.closeButtonText}>✕</Text>
      </Pressable>

      {/* Logo */}
      <Animated.View
        style={[
          styles.logoWrapper,
          {
            opacity: opacityAnim,
            transform: [
              { scale: scaleAnim },
              { rotate },
            ],
          },
        ]}
      >
        <Image
          source={require('../assets/sarasas-logo.svg')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Text */}
      <Animated.Text style={[styles.title1, { opacity: opacityAnim }]}>
        Sarasas Ektra School
      </Animated.Text>
      <Animated.Text style={[styles.title2, { opacity: opacityAnim }]}>
        School Of Sarasas
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e3c72',
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  closeButtonText: {
    fontSize: 28,
    color: '#ffffff',
    fontWeight: '300',
  },
  logoWrapper: {
    marginBottom: 40,
  },
  logo: {
    width: 150,
    height: 150,
  },
  title1: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffd700',
    marginBottom: 12,
    letterSpacing: 1,
  },
  title2: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  circle: {
    position: 'absolute',
    borderRadius: 200,
    opacity: 0.1,
  },
  circle1: {
    width: 200,
    height: 200,
    backgroundColor: '#ffd700',
    top: '10%',
    left: '10%',
  },
  circle2: {
    width: 300,
    height: 300,
    backgroundColor: '#fff',
    top: '50%',
    right: '10%',
  },
  circle3: {
    width: 150,
    height: 150,
    backgroundColor: '#ffd700',
    bottom: '10%',
    left: '20%',
  },
});
