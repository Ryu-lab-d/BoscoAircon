import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Animated, Text, Pressable } from 'react-native';
import Svg, { Path, Line, G, Circle, Polygon, Ellipse, Rect } from 'react-native-svg';

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
        <Svg width={150} height={180} viewBox="0 0 200 240">
          {/* Outer shield border */}
          <Path d="M 100 10 L 170 50 L 170 140 Q 170 190 100 230 Q 30 190 30 140 L 30 50 Z"
            fill="none" stroke="#1e3c72" strokeWidth="8" strokeLinejoin="round"/>

          {/* Shield background */}
          <Path d="M 100 18 L 162 54 L 162 140 Q 162 185 100 222 Q 38 185 38 140 L 38 54 Z"
            fill="#ffd700" stroke="none"/>

          {/* Inner border */}
          <Path d="M 100 26 L 154 58 L 154 140 Q 154 180 100 214 Q 46 180 46 140 L 46 58 Z"
            fill="none" stroke="#1e3c72" strokeWidth="4"/>

          {/* Dividers */}
          <Line x1="100" y1="26" x2="100" y2="214" stroke="#1e3c72" strokeWidth="3"/>
          <Line x1="46" y1="120" x2="154" y2="120" stroke="#1e3c72" strokeWidth="3"/>

          {/* Top-left: Dove */}
          <G transform="translate(73, 70)">
            <Ellipse cx="0" cy="0" rx="8" ry="10" fill="#1e3c72"/>
            <Circle cx="0" cy="-10" r="6" fill="#1e3c72"/>
            <Polygon points="4,-10 10,-10 6,-8" fill="#1e3c72"/>
          </G>

          {/* Top-right: Book */}
          <G transform="translate(127, 70)">
            <Rect x="-8" y="-10" width="16" height="20" fill="none" stroke="#1e3c72" strokeWidth="2"/>
            <Line x1="0" y1="-10" x2="0" y2="10" stroke="#1e3c72" strokeWidth="2"/>
          </G>

          {/* Bottom-left: Family */}
          <G transform="translate(73, 170)">
            <Circle cx="-6" cy="-8" r="4" fill="#1e3c72"/>
            <Polygon points="-6,-4 -10,0 -2,0" fill="#1e3c72"/>
            <Circle cx="0" cy="-6" r="3" fill="#1e3c72"/>
            <Polygon points="0,-3 -3,0 3,0" fill="#1e3c72"/>
            <Circle cx="6" cy="-6" r="3" fill="#1e3c72"/>
            <Polygon points="6,-3 3,0 9,0" fill="#1e3c72"/>
          </G>

          {/* Bottom-right: Flame */}
          <G transform="translate(127, 170)">
            <Ellipse cx="0" cy="5" rx="4" ry="3" fill="#1e3c72"/>
            <Path d="M -4 2 Q -6 -2 -2 -6 Q 0 -8 2 -6 Q 6 -2 4 2" fill="#1e3c72"/>
            <Circle cx="-6" cy="-2" r="1.5" fill="#1e3c72"/>
            <Circle cx="6" cy="-2" r="1.5" fill="#1e3c72"/>
            <Circle cx="0" cy="-10" r="1.5" fill="#1e3c72"/>
          </G>

          {/* Center Cross */}
          <G transform="translate(100, 120)">
            <Rect x="-3" y="-30" width="6" height="60" fill="#1e3c72"/>
            <Rect x="-15" y="-8" width="30" height="6" fill="#1e3c72"/>
          </G>
        </Svg>
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
