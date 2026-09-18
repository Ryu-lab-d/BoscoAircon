/**
 * @format
 */

// xlsx (SheetJS) expects a Node/browser-like environment. Hermes has neither
// Buffer nor TextEncoder/TextDecoder, so xlsx throws immediately on import
// without these polyfills installed first.
import { Buffer } from 'buffer';
import 'text-encoding-polyfill';
global.Buffer = Buffer;

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
