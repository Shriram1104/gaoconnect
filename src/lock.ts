import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const KEY = 'mymoney_device_lock_v1';
export async function isLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY)) === 'enabled';
}
export async function authenticate(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock MyMoney',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });
  return result.success;
}
export async function enableLock(): Promise<void> {
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) throw new Error('Set up a fingerprint, face unlock, or device credential in Android settings first.');
  if (!(await authenticate())) throw new Error('Device authentication was not successful.');
  await SecureStore.setItemAsync(KEY, 'enabled');
}
export async function disableLock(): Promise<void> {
  if (!(await authenticate())) throw new Error('Authentication required to disable app lock.');
  await SecureStore.deleteItemAsync(KEY);
}
