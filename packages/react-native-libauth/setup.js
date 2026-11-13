import structuredClone from '@ungap/structured-clone';
import 'fast-text-encoding';
import 'react-native-get-random-values';
import '@callstack/polygen/polyfill';

if (!globalThis.structuredClone) globalThis.structuredClone = structuredClone;
