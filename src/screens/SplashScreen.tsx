import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Animated, Text, Pressable } from 'react-native';
import Svg, { Path, Line, G, Circle, Polygon, Rect } from 'react-native-svg';

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
        <Svg width={150} height={168} viewBox="0 0 220 246">
          {/* Outer shield border (navy) */}
          <Path
            d="M 30 18 L 190 18 L 190 130 Q 190 195 110 236 Q 30 195 30 130 Z"
            fill="#26307a" stroke="#26307a" strokeWidth="2"
          />
          {/* Shield background (gold) */}
          <Path
            d="M 42 30 L 178 30 L 178 130 Q 178 186 110 222 Q 42 186 42 130 Z"
            fill="#ffc72c" stroke="none"
          />
          {/* Inner hairline border */}
          <Path
            d="M 48 36 L 172 36 L 172 130 Q 172 180 110 214 Q 48 180 48 130 Z"
            fill="none" stroke="#26307a" strokeWidth="2"
          />

          {/* Dividers */}
          <Line x1="110" y1="36" x2="110" y2="214" stroke="#26307a" strokeWidth="3"/>
          <Line x1="48" y1="122" x2="172" y2="122" stroke="#26307a" strokeWidth="3"/>

          {/* Top-left: Dove in flight, carrying an olive twig */}
          <G transform="translate(79, 78) rotate(-4)">
            {/* Body, tapering to a fanned tail */}
            <Path d="M -22 6 Q -10 2 0 4 Q 10 6 16 3 L 22 6 L 14 8 Q 6 11 -4 11 Q -16 11 -22 6 Z" fill="#26307a"/>
            {/* Raised wing */}
            <Path d="M -4 4 Q -2 -14 14 -20 Q 6 -13 6 -6 Q 14 -10 20 -6 Q 10 -3 6 2 Q 14 0 18 3 Q 6 6 -4 4 Z" fill="#26307a"/>
            {/* Head + beak */}
            <Circle cx="16" cy="1" r="3.4" fill="#26307a"/>
            <Path d="M 19 0 L 25 -1.5 L 20 2.5 Z" fill="#26307a"/>
          </G>

          {/* Top-right: open book */}
          <G transform="translate(146, 82)">
            <Path d="M 0 -14 Q -16 -18 -20 -12 L -20 12 Q -16 8 0 12 Z" fill="none" stroke="#26307a" strokeWidth="2.6" strokeLinejoin="round"/>
            <Path d="M 0 -14 Q 16 -18 20 -12 L 20 12 Q 16 8 0 12 Z" fill="none" stroke="#26307a" strokeWidth="2.6" strokeLinejoin="round"/>
            <Line x1="0" y1="-14" x2="0" y2="12" stroke="#26307a" strokeWidth="2"/>
          </G>

          {/* Bottom-left: family */}
          <G transform="translate(80, 168)">
            <Circle cx="-16" cy="-14" r="5.5" fill="#26307a"/>
            <Path d="M -25 10 Q -25 -6 -16 -6 Q -7 -6 -7 10 Z" fill="#26307a"/>
            <Circle cx="0" cy="-10" r="5" fill="#26307a"/>
            <Path d="M -8 12 Q -8 -2 0 -2 Q 8 -2 8 12 Z" fill="#26307a"/>
            <Circle cx="15" cy="-6" r="4.2" fill="#26307a"/>
            <Path d="M 8 14 Q 8 0 15 0 Q 22 0 22 14 Z" fill="#26307a"/>
          </G>

          {/* Bottom-right: flame with sparkles */}
          <G transform="translate(146, 168)">
            <Path d="M 0 20 Q -13 16 -13 3 Q -13 -8 -4 -20 Q -6 -10 0 -8 Q 2 -16 -1 -24 Q 14 -14 14 1 Q 14 10 8 16 Q 11 8 6 4 Q 5 12 0 20 Z" fill="#26307a"/>
            <Polygon points="-18,-16 -16,-11 -11,-9 -16,-7 -18,-2 -20,-7 -25,-9 -20,-11" fill="#26307a"/>
            <Polygon points="16,-20 17.5,-16 21.5,-14.5 17.5,-13 16,-9 14.5,-13 10.5,-14.5 14.5,-16" fill="#26307a"/>
            <Polygon points="2,-30 3,-27 6,-26 3,-25 2,-22 1,-25 -2,-26 1,-27" fill="#26307a"/>
          </G>

          {/* Center cross (gold with navy outline, matching the shield fill) */}
          <G transform="translate(110, 125)">
            <Rect x="-6" y="-42" width="12" height="86" fill="#ffc72c" stroke="#26307a" strokeWidth="2.5"/>
            <Rect x="-26" y="-14" width="52" height="12" fill="#ffc72c" stroke="#26307a" strokeWidth="2.5"/>
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
