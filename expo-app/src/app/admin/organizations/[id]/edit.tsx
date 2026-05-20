import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { YStack, XStack, Text, H1, Paragraph, Theme, useTheme, Label, Switch, Card } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  ArrowLeft, 
  Save, 
  Building2, 
  MapPin, 
  Activity, 
  Check, 
  PowerOff,
  Power
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { store } from '../../../../store/store';
import { useAuth } from '../../../../contexts/AuthContext';
import { MetalButton } from '../../../../components/ui/MetalButton';
import { MetalCard } from '../../../../components/ui/MetalCard';
import { OrgLogo } from '../../../../components/ui/OrgLogo';
import { Input } from '../../../../components/ui/Input';
import { Organization, Sport } from '@sk/types';

export default function OrganizationEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [org, setOrg] = useState<Organization | null>(null);
  const [sports, setSports] = useState<Sport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formShortName, setFormShortName] = useState('');
  const [formLogo, setFormLogo] = useState('');
  const [formPrimaryColor, setFormPrimaryColor] = useState('#000000');
  const [formSecondaryColor, setFormSecondaryColor] = useState('#ffffff');
  const [formSupportedSports, setFormSupportedSports] = useState<string[]>([]);
  const [formAllowUserImageUpdates, setFormAllowUserImageUpdates] = useState(false);
  
  // Address Sub-Fields
  const [formStreet, setFormStreet] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formProvince, setFormProvince] = useState('');
  const [formCountry, setFormCountry] = useState('');

  const primaryColor = theme.primary?.get() || '#10b981';
  const isAppAdmin = user?.globalRole === 'admin';

  useEffect(() => {
    if (!id) return;

    store.subscribeToOrganization(id);
    setSports(store.getSports());

    const updateData = () => {
      const foundOrg = store.getOrganization(id);
      if (foundOrg) {
        setOrg(foundOrg);
        
        // Populate fields
        setFormName(foundOrg.name || '');
        setFormShortName(foundOrg.shortName || '');
        setFormLogo(foundOrg.logo || '');
        setFormPrimaryColor(foundOrg.primaryColor || '#000000');
        setFormSecondaryColor(foundOrg.secondaryColor || '#ffffff');
        setFormSupportedSports(foundOrg.supportedSportIds || []);
        setFormAllowUserImageUpdates(foundOrg.settings?.allowUserImageUpdates || false);
        
        // Address details
        setFormStreet(foundOrg.address?.addressLine1 || '');
        setFormCity(foundOrg.address?.city || '');
        setFormProvince(foundOrg.address?.province || '');
        setFormCountry(foundOrg.address?.country || '');
        
        setIsLoading(false);
      }
    };

    updateData();
    const unsubscribe = store.subscribe(updateData);

    return () => {
      unsubscribe();
      store.unsubscribeFromOrganization(id);
    };
  }, [id]);

  const handleToggleSport = (sportId: string) => {
    setFormSupportedSports(current => {
      if (current.includes(sportId)) {
        return current.filter(sid => sid !== sportId);
      } else {
        return [...current, sportId];
      }
    });
  };

  const handleSaveSettings = async () => {
    if (!org) return;
    if (!formName.trim()) {
      Alert.alert('Validation Error', 'Organization Name is required.');
      return;
    }

    setIsProcessing(true);
    try {
      const fullAddress = [formStreet, formCity, formProvince, formCountry].filter(Boolean).join(', ');
      
      const updatePayload = {
        name: formName,
        shortName: formShortName.toUpperCase(),
        logo: formLogo,
        primaryColor: formPrimaryColor,
        secondaryColor: formSecondaryColor,
        supportedSportIds: formSupportedSports,
        settings: {
          allowUserImageUpdates: formAllowUserImageUpdates,
        },
        address: {
          id: org.address?.id || '',
          addressLine1: formStreet,
          city: formCity,
          province: formProvince,
          country: formCountry,
          fullAddress: fullAddress || ''
        }
      };

      await store.updateOrganization(id, updatePayload);
      Alert.alert('Success', 'Organization settings updated successfully.', [
        { text: 'OK', onPress: () => router.push(`/admin/organizations/${id}`) }
      ]);
    } catch (error: any) {
      Alert.alert('Save Failed', error.message || 'Something went wrong.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeactivate = async () => {
    if (!org) return;
    setIsProcessing(true);
    try {
      await store.updateOrganization(org.id, { isActive: !org.isActive });
      Alert.alert(
        'Success', 
        `${org.name} has been ${org.isActive ? 'deactivated' : 'activated'}.`,
        [{ text: 'OK', onPress: () => router.push(`/admin/organizations/${id}`) }]
      );
    } catch (e: any) {
      Alert.alert('Action Failed', e.message || 'Something went wrong.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading || !org) {
    return (
      <Theme name="dark">
        <YStack style={styles.container} justifyContent="center" alignItems="center" gap="$3">
          <ActivityIndicator size="large" color={primaryColor} />
          <Text color="$gray10" fontSize={14}>Loading settings form...</Text>
        </YStack>
      </Theme>
    );
  }

  const isDeactivated = org.isActive === false;

  return (
    <Theme name="dark">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView 
          style={styles.container} 
          contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(16, insets.top), paddingBottom: Math.max(40, insets.bottom) }]}
          keyboardShouldPersistTaps="handled"
        >
          <YStack padding="$5" gap="$6" flex={1} width="100%">
          
          {/* Action Header */}
          <XStack justifyContent="space-between" alignItems="center" marginTop="$2">
            <MetalButton 
              variantType="outlined" 
              size="sm"
              onPress={() => router.push(`/admin/organizations/${id}`)}
              icon={<ArrowLeft size={14} color={primaryColor} />}
            >
              Back
            </MetalButton>

            <MetalButton 
              variantType="filled" 
              glowColor={primaryColor}
              size="sm"
              onPress={handleSaveSettings}
              disabled={isProcessing || isDeactivated || !formName.trim()}
              icon={<Save size={14} color="#ffffff" />}
            >
              {isProcessing ? 'Saving...' : 'Save Settings'}
            </MetalButton>
          </XStack>

          {/* Page Title */}
          <YStack gap="$1.5">
            <H1 
              fontFamily="$heading" 
              fontSize={24} 
              color="$yellow10" 
              fontWeight="900" 
              letterSpacing={1.5}
            >
              ORGANIZATION SETTINGS
            </H1>
            <Paragraph color="$gray10" fontSize={13}>
              Manage profiles, physical locations, branding, and preferences
            </Paragraph>
          </YStack>

          {/* Read-only notice for deactivated orgs */}
          {isDeactivated && (
            <Card borderWidth={1} borderColor="#ef4444" backgroundColor="rgba(239, 68, 68, 0.05)" padding="$4" borderRadius={12} gap="$1">
              <Text color="#ef4444" fontWeight="800" fontSize={14}>Organization is Deactivated</Text>
              <Paragraph fontSize={12} color="$gray10">
                This organization is currently inactive. Re-activate it from the Danger Zone to enable profile editing and schedule feeds.
              </Paragraph>
            </Card>
          )}

          {/* Form Block */}
          <YStack gap="$5" opacity={isDeactivated ? 0.6 : 1}>
            
            {/* Identity & branding Card */}
            <MetalCard variant="dark" padding="$4" gap="$4">
              <XStack gap="$4" alignItems="center" borderBottomWidth={1} borderBottomColor="#27272a" paddingBottom="$3">
                <OrgLogo organization={{ ...org, primaryColor: formPrimaryColor, shortName: formShortName, name: formName }} size="md" />
                <YStack flex={1}>
                  <Text fontWeight="800" fontSize={16} color="$color">Branding Details</Text>
                  <Text fontSize={12} color="$gray10">Preview of your organization identity</Text>
                </YStack>
              </XStack>

              <YStack gap="$3.5">
                <YStack gap="$1">
                  <Label fontSize={12} color="$gray10" fontWeight="700">Organization Name *</Label>
                  <Input 
                    value={formName} 
                    onChangeText={setFormName} 
                    placeholder="Enter name"
                    disabled={isDeactivated}
                  />
                </YStack>

                <YStack gap="$1">
                  <Label fontSize={12} color="$gray10" fontWeight="700">Short Code (Up to 6 letters)</Label>
                  <Input 
                    value={formShortName} 
                    onChangeText={text => setFormShortName(text.toUpperCase().slice(0, 6))} 
                    placeholder="e.g. MON"
                    autoCapitalize="characters"
                    disabled={isDeactivated}
                  />
                </YStack>

                <XStack gap="$4" width="100%">
                  <YStack gap="$1" flex={1}>
                    <Label fontSize={12} color="$gray10" fontWeight="700">Primary Color (Hex)</Label>
                    <XStack gap="$2" alignItems="center">
                      <XStack width={24} height={24} borderRadius={6} backgroundColor={formPrimaryColor} borderWidth={1} borderColor="#27272a" />
                      <Input 
                        value={formPrimaryColor} 
                        onChangeText={setFormPrimaryColor} 
                        placeholder="#000000"
                        flex={1}
                        disabled={isDeactivated}
                      />
                    </XStack>
                  </YStack>

                  <YStack gap="$1" flex={1}>
                    <Label fontSize={12} color="$gray10" fontWeight="700">Secondary Color (Hex)</Label>
                    <XStack gap="$2" alignItems="center">
                      <XStack width={24} height={24} borderRadius={6} backgroundColor={formSecondaryColor} borderWidth={1} borderColor="#27272a" />
                      <Input 
                        value={formSecondaryColor} 
                        onChangeText={setFormSecondaryColor} 
                        placeholder="#ffffff"
                        flex={1}
                        disabled={isDeactivated}
                      />
                    </XStack>
                  </YStack>
                </XStack>

                <YStack gap="$1">
                  <Label fontSize={12} color="$gray10" fontWeight="700">Logo Image URL</Label>
                  <Input 
                    value={formLogo} 
                    onChangeText={setFormLogo} 
                    placeholder="Logo link or Base64 string"
                    disabled={isDeactivated}
                  />
                </YStack>
              </YStack>
            </MetalCard>

            {/* Location details card */}
            <MetalCard variant="dark" padding="$4" gap="$4">
              <XStack gap="$3" alignItems="center" borderBottomWidth={1} borderBottomColor="#27272a" paddingBottom="$3">
                <MapPin size={18} color={primaryColor} />
                <Text fontWeight="800" fontSize={16} color="$color">Headquarters Location</Text>
              </XStack>

              <YStack gap="$3.5">
                <YStack gap="$1">
                  <Label fontSize={12} color="$gray10" fontWeight="700">Street Address</Label>
                  <Input 
                    value={formStreet} 
                    onChangeText={setFormStreet} 
                    placeholder="123 Sport Avenue"
                    disabled={isDeactivated}
                  />
                </YStack>

                <XStack gap="$3">
                  <YStack gap="$1" flex={1}>
                    <Label fontSize={12} color="$gray10" fontWeight="700">City</Label>
                    <Input 
                      value={formCity} 
                      onChangeText={setFormCity} 
                      placeholder="Cityville"
                      disabled={isDeactivated}
                    />
                  </YStack>
                  <YStack gap="$1" flex={1}>
                    <Label fontSize={12} color="$gray10" fontWeight="700">Province / State</Label>
                    <Input 
                      value={formProvince} 
                      onChangeText={setFormProvince} 
                      placeholder="Province"
                      disabled={isDeactivated}
                    />
                  </YStack>
                </XStack>

                <YStack gap="$1">
                  <Label fontSize={12} color="$gray10" fontWeight="700">Country</Label>
                  <Input 
                    value={formCountry} 
                    onChangeText={setFormCountry} 
                    placeholder="Country"
                    disabled={isDeactivated}
                  />
                </YStack>
              </YStack>
            </MetalCard>

            {/* Sports Offered list */}
            <MetalCard variant="dark" padding="$4" gap="$4">
              <XStack gap="$3" alignItems="center" borderBottomWidth={1} borderBottomColor="#27272a" paddingBottom="$3">
                <Activity size={18} color={primaryColor} />
                <Text fontWeight="800" fontSize={16} color="$color">Sports Configuration</Text>
              </XStack>

              <YStack gap="$2.5">
                <Label fontSize={12} color="$gray10" fontWeight="700">Sports Offered Checklist</Label>
                <YStack gap="$2">
                  {sports.map(sport => {
                    const isSelected = formSupportedSports.includes(sport.id);
                    return (
                      <TouchableOpacity 
                        key={sport.id}
                        activeOpacity={0.8}
                        disabled={isDeactivated}
                        style={[
                          styles.sportCheckRow,
                          isSelected ? { borderColor: primaryColor, backgroundColor: 'rgba(16, 185, 129, 0.05)' } : null
                        ]}
                        onPress={() => handleToggleSport(sport.id)}
                      >
                        <XStack justifyContent="space-between" alignItems="center" width="100%">
                          <Text fontSize={13} fontWeight="800" color={isSelected ? '$color' : '$gray10'}>
                            {sport.name}
                          </Text>
                          <XStack 
                            width={18} 
                            height={18} 
                            borderRadius={4} 
                            borderWidth={1} 
                            borderColor={isSelected ? primaryColor : '#71717a'} 
                            backgroundColor={isSelected ? primaryColor : 'transparent'}
                            alignItems="center"
                            justifyContent="center"
                          >
                            {isSelected && <Check size={12} color="#000000" />}
                          </XStack>
                        </XStack>
                      </TouchableOpacity>
                    );
                  })}

                  {sports.length === 0 && (
                    <Text fontSize={11} fontStyle="italic" color="$gray9">No sports listed in the system</Text>
                  )}
                </YStack>
              </YStack>
            </MetalCard>

            {/* Roster Preferences */}
            <MetalCard variant="dark" padding="$4" gap="$3.5">
              <Text fontWeight="800" fontSize={16} color="$color">General Preferences</Text>
              
              <XStack justifyContent="space-between" alignItems="center" width="100%">
                <Label htmlFor="pref-user-images" fontSize={13} color="$gray10" flex={1} paddingRight="$4" cursor="pointer">
                  Allow members to update their own profile images
                </Label>
                <Switch 
                  id="pref-user-images"
                  size="$2"
                  checked={formAllowUserImageUpdates}
                  onCheckedChange={setFormAllowUserImageUpdates}
                  disabled={isDeactivated}
                >
                  <Switch.Thumb />
                </Switch>
              </XStack>
            </MetalCard>
          </YStack>

          {/* Danger Zone (Global App Admin Only) */}
          {isAppAdmin && (
            <YStack 
              borderRadius={16} 
              borderWidth={1.5} 
              borderColor="rgba(239, 68, 68, 0.3)" 
              backgroundColor="rgba(239, 68, 68, 0.03)" 
              padding="$4.5" 
              gap="$3.5"
              marginTop="$2"
            >
              <Text fontWeight="900" fontSize={14} color="#ef4444" letterSpacing={0.5}>
                DANGER ZONE (GLOBAL ADMIN)
              </Text>
              
              <YStack gap="$1.5">
                <Text fontWeight="800" fontSize={13} color="$color">
                  {org.isActive ? 'Deactivate Organization' : 'Activate Organization'}
                </Text>
                <Paragraph fontSize={11} color="$gray10" lineHeight={15}>
                  {org.isActive 
                    ? 'Marks the organization as inactive. It will become read-only but retain roster histories.' 
                    : 'Restores the organization into an active catalog, unlocking schedule actions.'}
                </Paragraph>
                <MetalButton 
                  variantType="outlined" 
                  glowColor={org.isActive ? '#f59e0b' : primaryColor}
                  size="sm"
                  onPress={handleDeactivate}
                  disabled={isProcessing}
                  style={{ alignSelf: 'flex-start', marginTop: 4 }}
                >
                  {org.isActive ? 'Deactivate Organization' : 'Activate Organization'}
                </MetalButton>
              </YStack>
            </YStack>
          )}

          {/* Footer Save buttons (only visible if not deactivated) */}
          {!isDeactivated && (
            <XStack gap="$3" marginTop="$2">
              <MetalButton 
                variantType="outlined" 
                size="sm"
                onPress={() => router.push(`/admin/organizations/${id}`)}
                style={{ flex: 1 }}
              >
                Cancel
              </MetalButton>
              <MetalButton 
                variantType="filled" 
                glowColor={primaryColor}
                size="sm"
                onPress={handleSaveSettings}
                disabled={isProcessing || !formName.trim()}
                style={{ flex: 1 }}
              >
                {isProcessing ? 'Saving...' : 'Save Settings'}
              </MetalButton>
            </XStack>
          )}

        </YStack>
      </ScrollView>
    </KeyboardAvoidingView>
  </Theme>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  sportCheckRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  }
});
