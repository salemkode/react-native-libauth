import React, { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StatusBar, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { initializeLibauth } from 'react-native-libauth';
import * as libauth from '@bitauth/libauth';
import { runChecks } from '../shared/suite';
import { styles, colors } from './theme';

const phases = {
  idle: { title: 'Ready to test', subtitle: 'Run the reference suite on this device.' },
  running: { title: 'Testing native crypto…', subtitle: 'Checking hashes, signatures, and key derivation.' },
  passed: { title: 'All checks passed', subtitle: 'Native results match the reference vectors.' },
  failed: { title: 'Checks need attention', subtitle: 'Inspect the results below for details.' },
  error: { title: 'Initialization failed', subtitle: 'Rebuild the app after generating the native modules.' },
};

function Lab() {
  const [state, setState] = useState({ phase: 'idle', results: [], detail: '', elapsed: 0 });
  const lock = useRef(false);
  const [message, setMessage] = useState('Hello, libauth');
  const [digest, setDigest] = useState('');

  async function run() {
    if (lock.current) return;
    lock.current = true;
    setState({ phase: 'running', results: [], detail: '', elapsed: 0 });
    try {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const start = Date.now();
      await initializeLibauth();
      const results = runChecks(libauth);
      const report = {
        phase: results.every(result => result.status === 'passed') ? 'passed' : 'failed',
        results,
        detail: '',
        elapsed: Date.now() - start,
      };
      globalThis.__LIBAUTH_QA__ = report;
      console.log('LIBAUTH_NATIVE_QA', JSON.stringify(report));
      setState(report);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setState({ phase: 'error', results: [], detail, elapsed: 0 });
    } finally {
      lock.current = false;
    }
  }

  async function hashMessage() {
    try {
      await initializeLibauth();
      setDigest(libauth.binToHex(libauth.sha256.hash(libauth.utf8ToBin(message))));
    } catch (error) {
      setDigest(error instanceof Error ? error.message : String(error));
    }
  }

  const phase = phases[state.phase];
  const passed = state.results.filter(result => result.status === 'passed').length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.topline}>
          <Text style={styles.eyebrow}>LIBAUTH / DEVELOPER TOOLS</Text>
          <Text style={styles.badge}>{Platform.OS.toUpperCase()} · HERMES</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>Native crypto.{ '\n' }Same libauth.</Text>
        <Text style={styles.intro}>A small test bench for libauth’s C and Rust crypto, compiled ahead of time for React Native.</Text>

        <View style={styles.pipeline}>
          <Text style={styles.pipelineText}>C + Rust  →  WASM  →  native C  →  JSI</Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.cardKicker}>REFERENCE SUITE</Text>
          <Text accessibilityLiveRegion="polite" testID="suite-status" style={styles.statusTitle}>{phase.title}</Text>
          <Text style={styles.statusSubtitle}>{phase.subtitle}</Text>
          <View style={styles.metrics}>
            <View><Text style={styles.metric}>{state.results.length ? `${passed}/${state.results.length}` : '12'}</Text><Text style={styles.metricLabel}>checks</Text></View>
            <View><Text style={styles.metric}>5</Text><Text style={styles.metricLabel}>native modules</Text></View>
            <View><Text style={styles.metric}>{state.results.length ? `${state.elapsed}` : '—'}</Text><Text style={styles.metricLabel}>milliseconds</Text></View>
          </View>
          <Pressable accessibilityRole="button" testID="run-suite" disabled={state.phase === 'running'} onPress={run} style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null, state.phase === 'running' ? styles.disabled : null]}>
            <Text style={styles.primaryLabel}>{state.phase === 'running' ? 'Running…' : state.results.length ? 'Run again  ↗' : 'Run native tests  ↗'}</Text>
          </Pressable>
          {state.detail ? <Text selectable style={styles.error}>{state.detail}</Text> : null}
        </View>

        <View style={styles.sectionHeading}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Test results</Text>
          <Text style={styles.small}>{state.results.length ? `${passed} passed` : 'Awaiting first run'}</Text>
        </View>
        {state.results.length ? state.results.map(result => (
          <View key={result.name} style={styles.result}>
            <View style={styles.resultLine}>
              <Text style={result.status === 'passed' ? styles.pass : styles.fail}>{result.status === 'passed' ? '✓' : '×'}</Text>
              <Text style={styles.resultName}>{result.name}</Text>
              <Text style={styles.small}>{result.duration}ms</Text>
            </View>
            {result.status === 'failed' ? <Text selectable style={styles.error}>{result.detail}</Text> : null}
          </View>
        )) : <Text style={styles.empty}>48 hash vectors, streaming boundaries, ECDSA, BCH Schnorr, invalid keys, CashAddress, and BIP32.</Text>}

        <View style={styles.playground}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Try a native hash</Text>
          <Text style={styles.caption}>SHA-256 · UTF-8 input</Text>
          <TextInput accessibilityLabel="Message to hash" testID="hash-input" style={styles.input} value={message} onChangeText={setMessage} multiline autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.muted} />
          <Pressable accessibilityRole="button" testID="compute-hash" onPress={hashMessage} style={styles.secondaryButton}><Text style={styles.secondaryLabel}>Compute SHA-256</Text></Pressable>
          {digest ? <Text selectable testID="hash-output" style={styles.digest}>{digest}</Text> : null}
        </View>
        <Text style={styles.footer}>LIBAUTH 3.0.0  ·  NATIVE LAB 0.1{ '\n' }Deterministic test keys only. No wallet or network access.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><Lab /></SafeAreaProvider>;
}
