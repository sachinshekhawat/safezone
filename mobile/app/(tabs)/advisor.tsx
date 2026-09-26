import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Chip, IconButton, Text, TextInput, useTheme } from 'react-native-paper';
import MaterialIcon from '@expo/vector-icons/MaterialCommunityIcons';
import type { ChatMessage } from '@safezone/shared';
import api from '../../src/lib/api';
import useLocationStore from '../../src/store/location-store';
import { SPACING } from '../../src/theme';

interface AdvisorMessage extends ChatMessage {
  grounded?: boolean;
  zonesMatched?: string[];
}

export default function AdvisorScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const selectedCity = useLocationStore((s) => s.selectedCity);

  const [messages, setMessages] = useState<AdvisorMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Ask me about any area we monitor and I'll answer from recorded risk data — the score, the trend, and the nearest police station. If I have no data for a place, I'll say so rather than guess.",
      created_at: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const listRef = useRef<FlatList<AdvisorMessage>>(null);

  const suggestions = selectedCity
    ? [`Is ${selectedCity.name} safe at night?`, 'Nearest police station?']
    : ['Is Paharganj safe at night?'];

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}`, role: 'user', content: trimmed, created_at: new Date().toISOString() },
    ]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.sendChatMessage(trimmed, 'advisor', sessionId);
      if (res.session_id) setSessionId(res.session_id);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now() + 1}`,
          role: 'assistant',
          content: res.message,
          created_at: new Date().toISOString(),
          grounded: res.metadata?.grounded,
          zonesMatched: res.metadata?.zones_matched,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now() + 1}`,
          role: 'assistant',
          content:
            "I can't reach the advisor right now. For emergencies call 112 (Police) or 181 (Women Helpline).",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { borderBottomColor: theme.colors.outlineVariant }]}>
        <MaterialIcon name="shield-check" size={22} color={theme.colors.primary} />
        <View>
          <Text variant="titleMedium">Safety Advisor</Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Answers from recorded zone data
          </Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.role === 'user';
          return (
            <View style={[styles.bubbleWrap, mine ? styles.mine : styles.theirs]}>
              <View
                style={[
                  styles.bubble,
                  mine
                    ? { backgroundColor: theme.colors.primary }
                    : { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant, borderWidth: 1 },
                ]}
              >
                <Text
                  variant="bodyMedium"
                  style={mine ? { color: theme.colors.onPrimary } : undefined}
                >
                  {item.content}
                </Text>
              </View>

              {item.role === 'assistant' && item.grounded && item.zonesMatched?.length ? (
                <Text variant="bodySmall" style={styles.grounded}>
                  Based on recorded data for {item.zonesMatched.join(', ')}
                </Text>
              ) : null}
              {item.role === 'assistant' && item.grounded === false ? (
                <Text variant="bodySmall" style={styles.ungrounded}>
                  No recorded data for that area — general guidance only
                </Text>
              ) : null}
            </View>
          );
        }}
        ListFooterComponent={
          <>
            {loading && <ActivityIndicator style={styles.typing} />}
            {messages.length === 1 && !loading && (
              <View style={styles.suggestions}>
                {suggestions.map((s) => (
                  <Chip key={s} onPress={() => send(s)} style={styles.suggestionChip}>
                    {s}
                  </Chip>
                ))}
              </View>
            )}
          </>
        }
      />

      <View
        style={[
          styles.composer,
          { borderTopColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface },
        ]}
      >
        <TextInput
          mode="outlined"
          dense
          value={input}
          onChangeText={setInput}
          placeholder="Ask about area safety…"
          style={styles.input}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
          disabled={loading}
        />
        <IconButton
          icon="send"
          mode="contained"
          size={24}
          disabled={!input.trim() || loading}
          onPress={() => send(input)}
        />
      </View>
      <Text variant="bodySmall" style={styles.disclaimer}>
        Statistical guidance, not a guarantee. In an emergency call 112.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  list: { padding: SPACING.md, gap: SPACING.sm },
  bubbleWrap: { maxWidth: '88%', marginBottom: SPACING.sm },
  mine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  grounded: { color: '#047857', marginTop: 4 },
  ungrounded: { opacity: 0.55, marginTop: 4 },
  typing: { marginVertical: SPACING.sm },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  suggestionChip: { marginRight: SPACING.xs },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, backgroundColor: 'transparent' },
  disclaimer: { textAlign: 'center', opacity: 0.5, paddingBottom: SPACING.sm },
});
