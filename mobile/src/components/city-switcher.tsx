import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  Modal,
  Portal,
  Searchbar,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import MaterialIcon from '@expo/vector-icons/MaterialCommunityIcons';
import type { City } from '@safezone/shared';
import useLocationStore from '../store/location-store';
import { SPACING } from '../theme';

/**
 * Top-bar city selector.
 *
 * Doubles as the recovery path when location is denied: the user can always
 * pick a city by hand, so a denied permission never leaves the app unusable.
 */
export default function CitySwitcher() {
  const theme = useTheme();
  const {
    cities,
    selectedCity,
    autoDetected,
    detecting,
    requestPermissionAndDetect,
    selectCity,
  } = useLocationStore();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter(
      (c) => c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q),
    );
  }, [cities, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <TouchableRipple
        onPress={() => setOpen(true)}
        borderless
        style={[styles.trigger, { borderColor: theme.colors.outline }]}
        accessibilityRole="button"
        accessibilityLabel={`Change city. Currently ${selectedCity?.name ?? 'none selected'}`}
      >
        <View style={styles.triggerInner}>
          <MaterialIcon name="map-marker" size={18} color={theme.colors.primary} />
          <Text variant="titleSmall" numberOfLines={1} style={styles.triggerLabel}>
            {selectedCity?.name ?? 'Select city'}
          </Text>
          {autoDetected && (
            <Chip compact textStyle={styles.chipText} style={styles.chip}>
              Near you
            </Chip>
          )}
          <MaterialIcon name="chevron-down" size={18} color={theme.colors.onSurfaceVariant} />
        </View>
      </TouchableRipple>

      <Portal>
        <Modal
          visible={open}
          onDismiss={close}
          contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleMedium" style={styles.modalTitle}>
            Choose a city
          </Text>

          <Button
            mode="contained-tonal"
            icon={() =>
              detecting ? (
                <ActivityIndicator size={16} color={theme.colors.primary} />
              ) : (
                <MaterialIcon name="crosshairs-gps" size={18} color={theme.colors.primary} />
              )
            }
            disabled={detecting}
            onPress={async () => {
              await requestPermissionAndDetect();
              close();
            }}
            style={styles.detectButton}
          >
            {detecting ? 'Finding your city…' : 'Use my current location'}
          </Button>

          <Searchbar
            placeholder="Search city or state"
            value={query}
            onChangeText={setQuery}
            style={styles.search}
            inputStyle={styles.searchInput}
          />

          <FlatList
            data={filtered}
            keyExtractor={(c) => c.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <Divider />}
            ListEmptyComponent={
              <Text style={styles.empty}>No city matches “{query}”.</Text>
            }
            renderItem={({ item }: { item: City }) => {
              const active = selectedCity?.id === item.id;
              return (
                <TouchableRipple
                  onPress={async () => {
                    await selectCity(item);
                    close();
                  }}
                  style={styles.row}
                >
                  <View style={styles.rowInner}>
                    <View style={styles.rowText}>
                      <Text
                        variant="bodyLarge"
                        style={active ? { color: theme.colors.primary, fontWeight: '700' } : undefined}
                      >
                        {item.name}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {item.state}
                      </Text>
                    </View>
                    {active && (
                      <MaterialIcon name="check" size={20} color={theme.colors.primary} />
                    )}
                  </View>
                </TouchableRipple>
              );
            }}
          />
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { borderWidth: 1, borderRadius: 10, paddingHorizontal: SPACING.sm },
  triggerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
  },
  triggerLabel: { maxWidth: 140 },
  chip: { height: 22 },
  chipText: { fontSize: 10, marginVertical: 0, marginHorizontal: 6 },
  modal: {
    marginHorizontal: SPACING.md,
    borderRadius: 16,
    padding: SPACING.md,
    maxHeight: '80%',
  },
  modalTitle: { marginBottom: SPACING.sm },
  detectButton: { marginBottom: SPACING.sm },
  search: { marginBottom: SPACING.sm, height: 48 },
  searchInput: { minHeight: 0 },
  list: { maxHeight: 340 },
  row: { paddingVertical: 10, paddingHorizontal: 4 },
  rowInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { flex: 1 },
  empty: { textAlign: 'center', paddingVertical: SPACING.lg, opacity: 0.6 },
});
